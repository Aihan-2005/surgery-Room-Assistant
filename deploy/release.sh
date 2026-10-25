#!/usr/bin/env bash
# Run on the VPS: bash deploy/release.sh local (build there), or SHA (pull CI images).
set -Eeuo pipefail
umask 077

release="${1:-}"
if [[ "$release" != local && ! "$release" =~ ^[0-9a-f]{40}$ ]]; then
    echo 'Usage: bash deploy/release.sh local|<40-character commit SHA>' >&2
    exit 2
fi

state_dir="${AIRWAY_STATE_DIR:-/srv/airway}"
project_dir="${AIRWAY_PROJECT_DIR:-$state_dir/surgery-Room-Assistant}"
env_file="${AIRWAY_ENV_FILE:-/etc/airway/compose.env}"
backup_root="${AIRWAY_BACKUP_DIR:-$state_dir/backups}"
compose_helper="${AIRWAY_COMPOSE_HELPER:-}"
[[ -f "$env_file" ]] || { echo "Missing $env_file" >&2; exit 1; }
# Existing installations may mount their trusted certificate through this
# helper. Plain Compose would silently remove that mount when recreating Caddy.
if [[ -z "$compose_helper" && -e "$(dirname "$env_file")/compose-https" ]]; then
    compose_helper="$(dirname "$env_file")/compose-https"
fi
if [[ -n "$compose_helper" && ! -x "$compose_helper" ]]; then
    echo "Compose helper is not executable: $compose_helper" >&2
    exit 1
fi
if grep -Eq '^(APP_HOST|APP_ORIGIN|DJANGO_SECRET_KEY|DB_PASSWORD)=.*(REPLACE_WITH|YOUR_SERVER_IP)' "$env_file"; then
    echo "Replace the example values in $env_file before deploying." >&2
    exit 1
fi
mkdir -p "$backup_root"
exec 9>"${AIRWAY_LOCK_FILE:-$state_dir/deploy.lock}"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
cd "$project_dir"

maintenance=false
backup_dir=''
on_exit() {
    local code=$?
    [[ "$code" == 0 ]] && return
    trap - EXIT
    if [[ "$maintenance" == true ]]; then
        compose stop gateway frontend backend || true
        echo "Deployment failed; apps are stopped. Backups: $backup_dir" >&2
        echo 'Inspect logs and the migration state before restarting or restoring.' >&2
    else
        echo 'Deployment failed before maintenance; existing apps were not stopped.' >&2
    fi
    exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [[ "$release" != local ]]; then
    # Refuse to overwrite tracked edits. Untracked secrets belong outside Git.
    [[ -z "$(git status --porcelain --untracked-files=no)" ]] || {
        echo 'Tracked server files have edits. Commit or move them before deploying.' >&2
        exit 1
    }
    GIT_TERMINAL_PROMPT=0 git fetch origin main
    latest_sha="$(git rev-parse origin/main)"
    if [[ "$latest_sha" != "$release" ]]; then
        echo 'This run has been superseded by a newer main commit; skipping deployment.'
        exit 0
    fi
    git checkout --detach "$release"
fi

export IMAGE_TAG="$release"
compose() {
    # CI streams this script into bash over SSH. Keep Compose from consuming
    # the remaining script as interactive container input.
    if [[ -n "$compose_helper" ]]; then
        "$compose_helper" "$@" < /dev/null
    else
        docker compose --env-file "$env_file" -f "$project_dir/compose.yaml" "$@" < /dev/null
    fi
}

# Never print the expanded config: it contains secrets.
compose config --quiet
command -v curl > /dev/null || { echo 'Install curl on the VPS before deploying.' >&2; exit 1; }
if [[ "$release" == local ]]; then
    compose build backend frontend
    compose pull db gateway
else
    compose pull
fi
# Seed new media/static volumes from the non-root backend image before Caddy
# can mount the static volume. Otherwise an empty volume could be root-owned.
compose run --rm --no-deps backend python -c "import os; assert os.access('/data/media', os.W_OK) and os.access('/data/static', os.W_OK), 'Check volume ownership (backend UID 10001)'"
compose run --rm --no-deps gateway caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

maintenance=true
compose stop gateway frontend backend
compose up -d --no-build --wait --wait-timeout 120 db

# Both database and photos are copied while all app writers are stopped.
backup_dir="$(mktemp -d "$backup_root/$(date -u +%Y%m%dT%H%M%SZ)-$release.XXXXXX")"
compose exec -T db pg_dump -U airway -d airway --format=custom > "$backup_dir/database.dump"
compose run --rm -T --no-deps backend tar -czf - -C /data/media . > "$backup_dir/media.tar.gz"
if [[ -f "$state_dir/current-release" ]]; then
    cp "$state_dir/current-release" "$backup_dir/previous-release"
fi

compose run --rm --no-deps backend python manage.py migrate --noinput
compose run --rm --no-deps backend python manage.py createcachetable
compose run --rm --no-deps backend python manage.py collectstatic --noinput
compose up -d --no-build --wait --wait-timeout 180 backend frontend
# Refresh published ports even if an earlier gateway start failed while a host
# web server occupied port 80. App health must pass before Caddy is recreated.
compose up -d --no-build --no-deps --force-recreate --wait --wait-timeout 180 gateway

# Check published ports from the VPS over loopback. Keep the public Host header
# and TLS identity, without requiring public-IP hairpin routing or external DNS.
# Expanded secrets stay in the pipe and are never logged by the checker.
compose config --format json | python3 "$project_dir/deploy/check_gateway.py"

printf '%s\n' "$release" > "$state_dir/current-release"
maintenance=false
echo "Deployment succeeded: $release. Backup: $backup_dir"
