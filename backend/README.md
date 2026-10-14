# Backend data collection

The browser keeps offline cases and photos in IndexedDB. This Django backend
stores synchronized cases in PostgreSQL and photo files under `MEDIA_ROOT`
(SQLite is available for local `DEBUG` development).
Offline persistence and compression on the phone require frontend code;
server processing begins only after an upload reaches Django.

## Run locally

From the `backend/` directory, use the project's `../venv` environment (it
contains the pinned Django dependencies):

```sh
../venv/bin/python manage.py runserver
```

Or activate it first with `source ../venv/bin/activate`, then run
`python manage.py runserver`. Plain `python3 manage.py runserver` uses whichever
Python is on your shell's `PATH`; on this checkout that Python does not have
Django installed. The separate `../.venv` environment also lacks Django.

## Full backup from admin

A **superuser** opens **`/admin/` → Assessments** and clicks **Download full
database + photos ZIP** above the list. This creates one backup across every
doctor and case; no case selection is needed. The selected-cases admin download
action was removed. The browser downloads an `airway-full-backup-*.zip` file to
the admin's device. The server uses private RAM/temporary disk while creating
and streaming it, then discards the temporary files; it does not retain a
permanent ZIP. The live database and photo files remain on the server.

Example full backup:

```text
database.dump
backup.json
cases/
  Ali-Reza-20261013T123000000000Z/
    Ali-Reza-20261013T123000000000Z-Case.json
    Ali-Reza-20261013T123000000000Z-Fields.json
    Ali-Reza-20261013T123000000000Z-Photo-front-01.jpg
    Ali-Reza-20261013T123000000000Z-Photo-side-01.jpg
unlinked-media/                       # only if unlinked files exist
```

`database.dump` is a PostgreSQL custom-format dump of **all** database tables,
including doctor/device records, cases, photo records, admin users and sessions.
Development SQLite uses `database.sqlite3` instead. The readable `cases/`
folders contain the original photo bytes. Older PNG/WebP files keep their
actual format extensions. `backup.json` maps each readable photo filename back
to the path stored in the database. Extra media with no matching photo record
is kept under `unlinked-media/`; it has no patient name available for labeling.
The downloaded ZIP contains sensitive patient and account data and should be
stored securely.

### Restore the full backup

To restore PostgreSQL into a **new empty database**, extract the ZIP and run
`pg_restore --no-owner --no-acl --dbname=airway database.dump`. With the matching
application version installed and its environment configured, restore the
readably named photos to their original storage paths using:

```sh
python manage.py restore_media_from_backup /path/to/airway-full-backup.zip
```

The command refuses to overwrite existing media files. For a development
SQLite backup, replace the SQLite database file while the app is stopped, then
run the same media command. A ZIP made while uploads are occurring can contain
a database snapshot and media files from slightly different moments; pause
uploads or use coordinated snapshots for a fully consistent restore point.

`pg_dump` must be installed on the VPS and be at least as new as its PostgreSQL
server. Set `PG_DUMP_PATH` in the backend environment if the default binary is
older; the backend also checks common versioned installation paths. Allow
temporary disk space for both the dump and ZIP. A missing database photo file
cancels the backup instead of producing an incomplete archive.

## Readable names and device dataset export

Patient database column names and UUID relationships are unchanged. Labels are
derived from `full_name` and the original `created_at`, rather than receipt time.
Timestamps are UTC in `YYYYMMDDTHHMMSSffffffZ` format. Spaces become hyphens;
Unicode names are retained. Unsafe filename characters are removed and the
name portion is limited to 100 UTF-8 bytes for Linux/ZIP portability. The full
patient name remains unchanged inside the JSON record.

A device can also `GET /api/assessments/export/` with its usual
`Authorization: Device <token>` header; that ZIP contains only that device's cases.

Example device dataset ZIP:

```text
manifest.json
Ali-Reza-20261013T123000000000Z/
  Ali-Reza-20261013T123000000000Z-Case.json
  Ali-Reza-20261013T123000000000Z-Fields.json
  Ali-Reza-20261013T123000000000Z-Photo-front-01.jpg
  Ali-Reza-20261013T123000000000Z-Photo-front-02.jpg
  Ali-Reza-20261013T123000000000Z-Photo-side-01.jpg
```

`Fields.json` has readable keys such as
`"Ali-Reza-20261013T123000000000Z-Sex": "M"`. `Case.json` keeps the original
database-style field names, case/photo UUIDs, doctor snapshot, completion state,
and photo filename mappings. Duplicate patient/time folders get `-02`, `-03`,
etc. Photo numbering is deterministic by UUID within each position; a draft
may receive different numbers after more photos are added. Completed cases
are immutable, so their numbering stays stable.

Exports include drafts as well as completed cases; use `is_complete` to select
the final research dataset. ZIP creation spills to temporary disk above 8 MiB.
JPEG bytes are stored in ZIP without another compression pass. Legacy
PNG/WebP photos are converted in the export without rewriting their originals.
Missing media causes an error, rather than producing an incomplete archive.
For large backups, ensure enough temporary disk space and sufficient server
request timeout for the ZIP to finish.

The device ZIP is a portable dataset; use the admin full backup for server
restoration.

## Image processing and completion

On upload the backend validates actual image contents, accepts single-frame
JPEG/PNG/WebP photos, rotates pixels according to EXIF orientation, flattens
transparency on white, and writes an actual RGB JPEG. Source resolution is
preserved; there is no resizing. RGB colour profiles are preserved; tagged
grayscale/CMYK images are converted to sRGB. EXIF metadata is removed after
orientation is applied.

Compression defaults to JPEG quality 90 with full colour sampling (4:4:4).
The number 90 controls JPEG encoding, **not** whether a photo is visually good
enough: dark, blurry, or otherwise low-quality photos are accepted.
Configure `PHOTO_JPEG_QUALITY` from 1 to 95. JPEG is lossy: use a lossless/original
retention workflow instead if exact source pixels are required by the study.
Already-small files are not guaranteed to become smaller after normalization.
See [Pillow's format documentation](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#jpeg).

Defaults: 5 MiB source upload limit and 40 million decoded pixels. High bit-depth
and animated images are rejected. Adjust `PHOTO_MAX_UPLOAD_BYTES` and
`PHOTO_MAX_PIXELS` for the VPS's memory and data protocol. Larger input limits
also need corresponding proxy limits. The current frontend proxy rejects files
above **4 MiB before they reach Django**; server compression cannot remove that
frontend constraint. Existing stored photos are not silently recompressed.

Draft cases may have zero photos. Completion requires at least one photo total
and at most five per position.
Parent-row locks serialize uploads and completion on PostgreSQL so simultaneous
requests cannot bypass the photo count limit or complete a photo-less case.
Photo paths allow 512 characters, fixing truncation for long position names.
Images are served through authenticated API/admin views, including in development;
the `/media/` directory is not exposed as a public endpoint.

Frontend numeric contract: full name at most 200 characters, age an integer from
1 to 120 for the app, sex `male`/`female` (the proxy maps to `M`/`F`), height and
weight at most one decimal place. Keep frontend ranges 30–250 cm and 1–500 kg.
The backend continues enforcing its existing model validators. Field additions
`case_label` and `field_labels` in API responses are read-only and derived;
patient SQL columns remain unchanged.

## One-time doctor setup and silent recovery

No repeated doctor login is needed. Device tokens have no expiry in this system.
The installation should keep a stable UUID, its token, and a separate recovery
key after the doctor enters a name once. Names are display labels, not proof of
identity: two doctors with the same name must not share cases automatically.

1. `POST /api/devices/register/` with `device_id` and `doctor_name` returns
   `device_id`, `token`, and `recovery_key` on initial registration. Save all three.
   Only hashes are stored server-side.
2. On an invalid token, silently `POST /api/devices/recover/` with the **original**
   `device_id` and `recovery_key`. The response returns a new `token` and the same
   UUID, preserving case ownership and allowing partially uploaded cases to resume.
3. Retry uploads with the replacement token and unchanged case/photo UUIDs.
   The old token is invalidated. The recovery key remains valid so recovery can
   be retried safely if its response is lost. Use HTTPS and store it as a secret.
4. For older registrations, while their original token still works, call
   `POST /api/devices/recovery-key/` with that token to provision a recovery key.
   Calling this endpoint again replaces the old recovery key.

Disabled devices cannot recover. If both token and recovery key are lost, or
local storage is wiped, admin assistance is needed; the doctor name alone must
not unlock old patient records. Recovery does not recreate browser IndexedDB.
The backend's authenticated list/export/download endpoints expose uploaded data.
Requests with a deliberately disabled device's token return HTTP 403 so the
existing frontend does not treat an admin block as a 401 re-registration event.

**Frontend handoff:** the current app does not store `recovery_key`, does not
proxy the recovery endpoints, and creates a new UUID after token rejection.
Its developer must retain the key, proxy these endpoints, and recover the
original UUID instead. The doctor still enters their name only once. These
backend changes cannot alter the existing frontend's re-registration behavior.

## Linux VPS deployment

Requirements: Python 3.12 or newer (tested here on 3.14), PostgreSQL client tools
(`pg_dump` and `pg_restore`), Nginx,
HTTPS, and sufficient disk space for photos and temporary ZIP exports.
Ubuntu 24.04 LTS is the recommended VPS choice for this setup; it provides
Python 3.12 and PostgreSQL 16. Debian 13 is also suitable. Ubuntu 22.04's
default Python 3.10 is too old for the pinned Django version, and Ubuntu 20.04
is past standard support.

Use `/srv/airway/surgery-Room-Assistant` for the checkout and `/srv/airway/venv`
for the virtual environment. Create an unprivileged service user named `airway`
and a PostgreSQL role/database with that name. Keep the PostgreSQL port local.
Install the repository's pinned dependencies from `requirements.txt` into the
virtual environment. Copy `env.example` to `/etc/airway/backend.env`, replace
the domain, secret key and database credentials, and restrict the file to the
service account. Keep `DJANGO_SECRET_KEY` stable across restarts.

Create `/var/lib/airway/media` owned by `airway` with mode 0700 and
`/var/lib/airway/static` owned by `airway` with mode 0755. Ensure the static
directory's parent can be traversed by Nginx. Load the production environment
in the deployment shell as the service account, then run:

```sh
cd /srv/airway/surgery-Room-Assistant/backend
/srv/airway/venv/bin/python manage.py migrate
/srv/airway/venv/bin/python manage.py createcachetable
/srv/airway/venv/bin/python manage.py collectstatic --noinput
/srv/airway/venv/bin/python manage.py createsuperuser
/srv/airway/venv/bin/python manage.py check --deploy
```

The shared database cache in `env.example` gives all workers the same rate-limit
state. Do not use the default per-process memory cache as a global multi-worker
rate limit. Nginx must overwrite forwarded headers; `NUM_PROXIES=1` matches the
single Nginx proxy in the supplied configuration. If the frontend forwards all
registration requests from its own server, that server may share a rate-limit
bucket; set rates for the expected number of doctors.

Obtain a TLS certificate for the API domain before enabling `deploy/nginx.conf`.
Replace its domain/certificate paths, install it as a Nginx site, and validate
with `nginx -t`. Install `deploy/gunicorn.service` as the systemd service, reload
systemd, then start Gunicorn and Nginx. The supplied unit binds Gunicorn only to
localhost, runs as `airway`, and permits writes to media and its private temporary
directory. Static files are collected during deployment, outside that service.
Verify HTTPS `/api/health/` returns `database_ready: true`, registration works,
an upload/completion succeeds, admin previews work, and a full admin backup ZIP
opens and restores to a disposable test database/media directory.

For each release, make a full backup, deploy code/dependencies, run
migrations and `collectstatic`, then restart the service. For a consistent backup
while collecting data, temporarily stop new writes or use coordinated database
and filesystem snapshots. Keep backups outside the checkout and test restoration.
No VPS settings or services have been installed by this change.
