# Surgery Room Assistant

The app collects airway assessment cases and photos. The frontend keeps cases
offline in browser IndexedDB and synchronizes them to the Django backend. On the
server, PostgreSQL stores case data and photo records; the photo bytes live in
the private `MEDIA_ROOT` directory. The backend supports patient-readable ZIP
backups without changing database column names or its UUID relationships.

## Current backend behavior

- A Django superuser can open **Admin → Assessments** and click **Download full
  database + photos ZIP**. The browser downloads one full backup containing a
  PostgreSQL dump and `cases/PatientName-Time/` folders with readable field and
  photo filenames. No cases need to be selected. The ZIP is created on demand;
  the server does not keep a permanent copy. Its manifest maps the readable
  photo names back to the original storage paths for restoration.
- The backend converts valid single-frame JPEG, PNG, and WebP uploads to JPEG
  before server storage. JPEG quality 90 is an encoding setting, not a visual
  quality test: dark or blurry photos are still accepted. Completion requires
  at least one uploaded photo. Technical limits and supported formats are in
  the [backend README](backend/README.md#image-processing-and-completion).
- Device registration returns a token and recovery key. Recovering with the
  original device UUID and key preserves ownership of its past cases. The
  frontend still needs the [recovery integration](backend/README.md#one-time-doctor-setup-and-silent-recovery)
  before it can do this silently for doctors; no frontend code was changed.
- Patient images are stored under `MEDIA_ROOT` and served through authenticated
  API or admin views. The public `/media/` route is disabled.

The full-backup format, [restore procedure](backend/README.md#full-backup-from-admin),
API contract, and [Linux VPS deployment guide](backend/README.md#linux-vps-deployment)
are in the backend README. Ubuntu 24.04 LTS is the recommended starting point
for the VPS; Debian 13 also meets the backend's Python requirement. This
repository has not been deployed to a VPS yet.

The [frontend README](front/airway-assistant/README.md) contains the frontend's
development commands.
