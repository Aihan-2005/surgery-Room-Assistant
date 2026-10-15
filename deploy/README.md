# Docker and automatic deployment on Ubuntu 24.04

The existing VPS checkout is `/srv/airway/surgery-Room-Assistant`. This setup
runs Next.js, Django/Gunicorn, PostgreSQL 17 and Caddy with Docker Compose.
The database and photos live in Docker volumes, independently of app images.
Only Caddy publishes ports (80 and 443); PostgreSQL and both app ports are private.
Containers restart after crashes and server reboots when Docker is enabled.

The host's existing PostgreSQL installation is separate. This starts a **new
empty container database**, as requested; it does not delete the host database
or copy its data. The old non-Docker Nginx/systemd examples remain available in
`backend/deploy/` but are not used by this configuration.

## 1. Install Docker and prepare the VPS

Run the following installation commands **on the Ubuntu 24.04 VPS as root**.
They follow the provider's ParsVDS APT mirror and Arvan Docker Hub mirror setup.
The mirror setup changes the server's APT sources; it is not a command to run on
your Mac.

Download and run the provider's mirror setup:

```sh
curl -fsSL https://mirror.parsvds.com/scripts/parsvds-mirror-setup.sh \
  -o /tmp/parsvds-mirror-setup.sh
bash /tmp/parsvds-mirror-setup.sh
```

Choose **1: Switch BASE repos to ParsVDS (Ubuntu/Debian)**. This project uses
PostgreSQL, so the MariaDB options are unnecessary. If the menu returns, choose
0 to exit. If Docker CE is already installed from Docker's own repository, keep
that installation and its Compose/Buildx plugins and skip the package-install
block below; do not mix the Docker CE and Ubuntu package families.

For a fresh installation, refresh APT and install Ubuntu's Docker packages:

```sh
apt update
apt install -y docker.io docker-compose-v2 docker-buildx python3
systemctl enable --now docker
```

Use `docker-compose-v2`, which provides `docker compose`, and `docker-buildx`
for builds. The provider example's `docker-compose` package is the legacy
1.29.2 release in Ubuntu 24.04, while the v2 package meets this project's minimum
version. See the Ubuntu [Compose v2 package](https://packages.ubuntu.com/noble/arm64/docker-compose-v2)
and [legacy Compose package](https://packages.ubuntu.com/noble/docker-compose).

Add the Arvan mirror while preserving other Docker daemon settings and backing
up any existing configuration:

```sh
install -d -m 755 /etc/docker
python3 - <<'PY'
import datetime
import json
from pathlib import Path
import shutil

path = Path('/etc/docker/daemon.json')
config = json.loads(path.read_text()) if path.exists() else {}
mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
if path.exists():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    shutil.copy2(path, path.with_name(f'daemon.json.backup-{stamp}'))
mirrors = config.setdefault('registry-mirrors', [])
if 'https://docker.arvancloud.ir' not in mirrors:
    mirrors.insert(0, 'https://docker.arvancloud.ir')
pending = path.with_name('daemon.json.pending')
pending.write_text(json.dumps(config, indent=2) + '\n')
pending.chmod(mode)
pending.replace(path)
PY
dockerd --validate --config-file=/etc/docker/daemon.json
```

If validation reports an error, fix the configuration before restarting Docker.
Restarting the daemon can interrupt existing containers. No `docker logout`
is needed to apply a registry mirror.

```sh
systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
docker run --rm hello-world
docker compose version
docker buildx version
```

The Arvan mirror is for **Docker Hub images** (Python, Node, PostgreSQL and Caddy).
Your CI application images use `ghcr.io`; the VPS still needs direct access and,
for private images, a registry login as explained below. Docker registry mirrors
do not proxy GHCR. See [Docker's registry mirror documentation](https://docs.docker.com/docker-hub/image-library/mirror/).

To check that GHCR is reachable from the VPS:

```sh
curl -I --connect-timeout 15 https://ghcr.io/v2/
```

A `401 Unauthorized` response from this unauthenticated request is expected;
the authenticated image pull later is the access check.

Use Compose v2.24 or newer. Allow TCP 80 and 443 through the VPS provider firewall
and the host firewall, preserving SSH access. Caddy needs those ports free; check
`sudo ss -ltnp` for an existing Nginx/Apache listener before starting it. Stop the
old frontend/backend terminal commands when switching to Docker.

After these repository changes are committed and available on the server:

```sh
cd /srv/airway/surgery-Room-Assistant
sudo install -d -m 700 /etc/airway
sudo cp deploy/compose.env.example /etc/airway/compose.env
sudo chmod 600 /etc/airway/compose.env
openssl rand -hex 32
openssl rand -hex 32
sudo nano /etc/airway/compose.env
```

Put the two different generated values into `DJANGO_SECRET_KEY` and `DB_PASSWORD`.
Replace `YOUR_SERVER_IP` in `APP_HOST` and `APP_ORIGIN` with your public VPS IP.
Keep secrets on the VPS; do not paste them into chat or commit them. The env file
uses Compose syntax: single-quote values containing literal `$` characters.
Generate hex secrets as shown above to avoid quoting issues.

## 2. First deployment, without a domain

If the build times out at `deb.debian.org` and then reports `Unable to locate
package postgresql-client-17`, the missing APT indexes are the cause. The
Ubuntu host's APT mirror and the Docker Hub mirror do not configure the Debian
repositories inside the Python image. The backend accepts separate build mirror
settings. To use ParsVDS for the main Debian repository, run on the VPS as root:

```sh
python3 - <<'PY'
from pathlib import Path
import shutil
import time

path = Path('/etc/airway/compose.env')
original = path.read_text()
shutil.copy2(path, f'{path}.before-build-mirrors-{time.time_ns()}')
values = {
    'DEBIAN_MIRROR': 'https://mirror.parsvds.com/debian',
    'DEBIAN_SECURITY_MIRROR': 'https://security.debian.org/debian-security',
}
lines = [line for line in original.splitlines() if line.partition('=')[0] not in values]
lines.extend(f'{key}={value}' for key, value in values.items())
path.write_text('\n'.join(lines) + '\n')
PY
```

This preserves the existing app settings, secrets and file permissions. Check
reachability from the VPS before retrying the build:

```sh
curl -fsSL --connect-timeout 10 --max-time 30 \
  https://mirror.parsvds.com/debian/dists/trixie/InRelease -o /dev/null &&
curl -fsSL --connect-timeout 10 --max-time 30 \
  https://security.debian.org/debian-security/dists/trixie-security/InRelease -o /dev/null &&
echo 'Both Debian repositories are reachable'
```

ParsVDS's advertised `/debian-security/` endpoint returned 404 when checked;
keep the official security repository over HTTPS unless an accessible alternative
is verified. Debian's package signature checks stay enabled. APT index failures
now stop the build immediately instead of continuing with missing indexes.

If the official security repository is unreachable, Liara provides
`https://linux-mirror.liara.ir/repository/debian-security` as an alternative for
`DEBIAN_SECURITY_MIRROR`. Its Debian security mirror is separate from its Docker
Hub mirror. See [Liara Debian mirrors](https://docs.liara.ir/mirrors/debian/).
An HTTP 200 for `InRelease` only confirms connectivity: APT must still verify
the signed release, expiry and package index checksums. If APT reports an
unexpected size or hash mismatch, use a consistent mirror; do not disable checks.

If the next build step retries connections to `pypi.org`, or `npm ci` cannot
download packages, add these build settings to `/etc/airway/compose.env`:

```dotenv
PIP_INDEX_URL=https://package-mirror.liara.ir/repository/pypi/simple
NPM_REGISTRY=https://package-mirror.liara.ir/repository/npm/
```

See Liara's [Python mirror](https://docs.liara.ir/mirrors/pypi/) and
[npm mirror](https://docs.liara.ir/mirrors/npm/) instructions. Compose passes
these as Docker build arguments; exporting them on the Ubuntu host alone does
not configure a Dockerfile that lacks these arguments. Standard public registries
remain the defaults when the settings are absent, including in GitHub CI.
The npm lockfile and its integrity checks stay unchanged. These settings apply
to package installation, not runtime app configuration. Do not put registry
credentials in build arguments; these options are for public package mirrors.
Retry with `bash deploy/release.sh local` after saving the settings.

Leave `SITE_ADDRESS=:80`, `DJANGO_COOKIE_SECURE=0`, and `HSTS_SECONDS=0` for
temporary HTTP testing. `APP_ORIGIN` must be `http://YOUR_SERVER_IP`, with no
trailing slash. From the checkout, as a user with Docker access:

```sh
bash deploy/release.sh local
docker compose --env-file /etc/airway/compose.env ps
docker compose --env-file /etc/airway/compose.env exec backend python manage.py createsuperuser
```

Open `http://YOUR_SERVER_IP` and `http://YOUR_SERVER_IP/admin/`. This builds the
app images on the VPS only for this initial/manual deployment. An HTTP IP address
is suitable for basic page/admin checks with test data. Phone camera access,
service workers and notifications need a secure context; use HTTPS before using
the app to collect real cases. See
[browser secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts).

Do not start the app with `docker compose up` alone on an empty database: the
release script runs migrations, creates the database cache table and collects
admin static files before starting the apps.

## 3. Add your domain and HTTPS

Create an A record pointing the domain (for example `app.yourdomain.com`) to the
VPS IP. If you add an AAAA record, it must also reach this VPS. In
`/etc/airway/compose.env`, change:

```dotenv
SITE_ADDRESS=app.yourdomain.com
APP_HOST=app.yourdomain.com
APP_ORIGIN=https://app.yourdomain.com
DJANGO_COOKIE_SECURE=1
HSTS_SECONDS=3600
```

Redeploy using the same release mode/tag currently running. For the initial local
build this is `bash deploy/release.sh local`; after a CI release use its commit
SHA instead. Caddy obtains and renews the certificate automatically and redirects
public HTTP to HTTPS. Its certificate storage persists in a volume. You need one
domain for both app and admin, not separate frontend/backend domains. See
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Django's own SSL redirect is disabled **only in Compose**, because Caddy handles
the redirect and Next.js calls Django through the private HTTP network. Secure
cookies remain enabled by default unless explicitly disabled for the HTTP test.

Changing the origin from HTTP/IP to HTTPS/domain creates a new browser storage
origin. Offline cases and the local doctor profile do not move automatically;
finish testing before collecting real data.

## 4. Enable GitHub Actions deployment

The workflow `.github/workflows/ci-cd.yml` runs on pull requests to `main`, pushes
to `main`, and manual runs. It:

1. Checks Django, missing migrations and the backend tests on PostgreSQL.
2. Runs frontend lint and a production build.
3. Builds AMD64 and ARM64 images. On `main` it publishes them to GitHub Container
   Registry, tagged with the exact Git commit SHA. PRs never publish or deploy.
4. When enabled, connects to the VPS over SSH and deploys that checked commit.

Current application lint/test failures are real gates: do not enable deployment
until the checks pass. Merging a workflow does not make failing app checks pass.

The public `/api/push/config`, `/api/push/subscriptions` and `/api/push/test`
paths go to the Next.js handlers, which translate the browser's device-token
header before calling Django. Their slash-terminated backend API equivalents
remain routed to Django. Preserve this distinction when changing the proxy.

Create a dedicated SSH deployment user, for example `airway-deploy`, with access
to the checkout, `/srv/airway/deploy.lock`, `/srv/airway/current-release`, backups,
the env file and Docker. Docker group membership grants root-equivalent server
access; use a dedicated key and account for deployment. One possible setup is:

```sh
sudo adduser --disabled-password --gecos '' airway-deploy
sudo usermod -aG docker airway-deploy
sudo chown -R airway-deploy:airway-deploy /srv/airway/surgery-Room-Assistant
sudo install -d -o airway-deploy -g airway-deploy -m 700 /srv/airway/backups
sudo touch /srv/airway/deploy.lock /srv/airway/current-release
sudo chown airway-deploy:airway-deploy /srv/airway/deploy.lock /srv/airway/current-release
sudo chown root:airway-deploy /etc/airway /etc/airway/compose.env
sudo chmod 750 /etc/airway
sudo chmod 640 /etc/airway/compose.env
```

Install the **public** deployment SSH key into that user's `authorized_keys` with
normal SSH file permissions. Store its private half as `VPS_SSH_KEY` in GitHub.
The deployment user must be able to `git fetch origin main` non-interactively;
for a private repository, configure a read-only repository deploy key on the VPS.
Test SSH and Git as this user before enabling the workflow.

For private GHCR images, log into GHCR **on the VPS as the deployment user**:

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

At the password prompt use a token with `read:packages` and access to these image
packages. This is separate from the temporary `GITHUB_TOKEN` used by CI to push.
The workflow needs repository Actions permissions that allow package publishing.

Under GitHub repository **Settings → Secrets and variables → Actions**, add:

| Type | Name | Value |
| --- | --- | --- |
| Repository variable | `DEPLOY_ENABLED` | `true` only after setup and passing checks |
| Variable | `VPS_HOST` | VPS public IP or SSH hostname |
| Variable | `VPS_USER` | `airway-deploy` |
| Variable | `VPS_PORT` | SSH port, normally `22` |
| Secret | `VPS_SSH_KEY` | Dedicated private deployment key |
| Secret | `VPS_KNOWN_HOSTS` | Verified SSH known_hosts entry for the VPS |

Generate the known_hosts entry from a trusted computer and compare its fingerprint
with the VPS host public key through the provider console. Do not blindly trust
an unverified `ssh-keyscan` result. On the VPS, public fingerprints can be read
with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. For a nonstandard SSH port,
the known_hosts hostname is `[HOST]:PORT`.

The deployment job uses the GitHub environment `production`. Optionally configure
it to allow only `main` and to require approval. Required approval changes the
flow to a manual production gate; omit it for fully automatic deployment.
Protect `main` with required `Backend checks`, `Frontend checks`, and `Build
container images` checks, plus `Deployment checks`. The latter exercises release
ordering and failure handling with fake commands and no real server data. See
[GitHub deployment controls](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).

After setup, push/merge to `main`. Builds happen on GitHub; the VPS pulls the
images and runs them. The deploy script refuses tracked server edits, checks out
the exact commit in detached HEAD, skips superseded runs, and serializes releases
with a server lock. Keep the managed checkout free of tracked edits. Do not use
it as a development working directory. Runtime secrets remain in `/etc/airway`.

## Release behavior and recovery

Images are prepared/pulled before maintenance. Then the script stops the public
gateway and both apps, backs up the container database and media, applies
migrations, collects static files, starts the apps, and checks container health
plus the public homepage/API. This simple single-VPS setup has downtime during
backup, migration and restart; it does not provide zero-downtime deployment.

Backups are private directories under `/srv/airway/backups/`, each containing
`database.dump`, `media.tar.gz`, and, after the first successful release,
`previous-release`. Files are ordinary PostgreSQL custom-format dumps and a tar
of the original media paths. Keep off-server copies and test restoration.
Backups are retained; monitor disk space and choose a retention policy rather
than pruning patient backups automatically. The full admin ZIP backup remains
available separately.

If a release fails after maintenance begins, the script leaves all apps stopped
and returns failure; it never blindly reverses migrations or restores a database.
Inspect `docker compose --env-file /etc/airway/compose.env logs --tail=100` and the
migration state first. A failed pull/build before maintenance leaves existing
containers running.

For code-only rollback, first establish that the old code is compatible with the
current schema. Then check out the prior successful SHA, export `IMAGE_TAG` to
that SHA, and run Compose with `--no-build`. The automated release script refuses
older SHA deployments because it requires the current `origin/main`; use a
revert commit on `main` for the normal rollback path.

For a database/media restore, stop all apps, use a **new empty database** and a
fresh media volume, restore with `pg_restore --no-owner --no-acl`, extract
`media.tar.gz` to that volume as UID 10001, and start the matching application
release. Verify restore in a disposable environment first. The initial backup
of an empty database does not include later tables or an admin account.

Do not run `docker compose down -v`: `-v` deletes the persistent database, photos
and certificate volumes. Normal image pulls/recreates preserve these volumes.
Do not change `DB_PASSWORD` after database initialization without rotating the
PostgreSQL role password too; the image's initialization variable does not change
an existing database password.
