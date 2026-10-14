"""Restore original MEDIA_ROOT paths from a readable full-backup ZIP."""

import json
import shutil
from pathlib import Path, PurePosixPath
from zipfile import ZipFile

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


def safe_relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise CommandError("Invalid path in backup manifest.")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in (".", "..") for part in value.split("/")):
        raise CommandError("Unsafe path in backup manifest.")
    return path


class Command(BaseCommand):
    help = "Restore media paths from a readable full-backup ZIP into MEDIA_ROOT."

    def add_arguments(self, parser):
        parser.add_argument("backup_zip", type=Path)

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        if media_root.is_symlink():
            raise CommandError("MEDIA_ROOT must not be a symbolic link.")
        with ZipFile(options["backup_zip"]) as archive:
            try:
                manifest = json.loads(archive.read("backup.json"))
            except (KeyError, ValueError) as exc:
                raise CommandError("This ZIP has no valid backup manifest.") from exc
            if manifest.get("format_version") != 2:
                raise CommandError("This command requires a version 2 full backup.")
            entries = []
            seen = set()
            for item in manifest.get("media_files", []):
                archive_path = safe_relative_path(item["archive_path"])
                storage_path = safe_relative_path(item["storage_path"])
                if str(storage_path) in seen or str(archive_path) not in archive.namelist():
                    raise CommandError("Duplicate or missing media entry in backup.")
                seen.add(str(storage_path))
                target = media_root.joinpath(*storage_path.parts)
                if target.exists() or target.is_symlink():
                    raise CommandError(f"Refusing to overwrite existing media file: {storage_path}")
                entries.append((str(archive_path), target))
            for archive_path, target in entries:
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.parent.resolve().is_relative_to(media_root.resolve()):
                    raise CommandError("A media directory points outside MEDIA_ROOT.")
                with archive.open(archive_path) as source, target.open("xb") as destination:
                    shutil.copyfileobj(source, destination)
        self.stdout.write(self.style.SUCCESS(f"Restored {len(entries)} media files."))
