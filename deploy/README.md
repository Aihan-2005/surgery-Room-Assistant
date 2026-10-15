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

Install Docker Engine and the Compose plugin using the
[official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
Then check:

```sh
sudo systemctl enable --now docker
docker version
docker compose version
```

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
