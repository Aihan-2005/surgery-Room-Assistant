"""On-demand, restorable database and media archive for a superuser."""

import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from django.conf import settings
from django.db import connections
from django.utils import timezone
from PIL import Image, UnidentifiedImageError

from .exports import write_json
from .models import Assessment
from .serializers import AssessmentSerializer


class BackupError(Exception):
    pass


def _pg_dump_command():
    major = connections["default"].pg_version // 10000
    configured = settings.PG_DUMP_PATH
    candidates = ([configured] if configured else [
        shutil.which(f"pg_dump-{major}"),
        f"/usr/lib/postgresql/{major}/bin/pg_dump",
        f"/opt/homebrew/opt/postgresql@{major}/bin/pg_dump",
        shutil.which("pg_dump"),
    ])
    for candidate in filter(None, candidates):
        if not shutil.which(candidate):
            continue
        try:
            result = subprocess.run([candidate, "--version"], capture_output=True,
                                    text=True, check=False)
        except OSError:
            continue
        match = re.search(r"pg_dump \(PostgreSQL\) (\d+)", result.stdout)
        if result.returncode == 0 and match and int(match.group(1)) >= major:
            return candidate
    raise BackupError(f"Install pg_dump version {major} or newer, or set PG_DUMP_PATH to it.")


def _dump_database(destination):
    config = connections["default"].settings_dict
    engine = config["ENGINE"]
    if engine == "django.db.backends.postgresql":
        command = [_pg_dump_command(), "--format=custom", "--no-owner", "--no-acl", "--file", str(destination)]
        for option, key in (("--host", "HOST"), ("--port", "PORT"), ("--username", "USER")):
            if config.get(key):
                command.extend((option, str(config[key])))
        command.append(str(config["NAME"]))
        environment = os.environ.copy()
        environment["PGCONNECT_TIMEOUT"] = "10"
        if config.get("PASSWORD"):
            environment["PGPASSWORD"] = config["PASSWORD"]
        try:
            result = subprocess.run(command, env=environment, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.PIPE, timeout=None, check=False)
        except OSError as exc:
            raise BackupError("Could not run pg_dump on the server.") from exc
        if result.returncode:
            raise BackupError("Database dump failed. Check PostgreSQL access and pg_dump version on the server.")
        return "postgresql", "database.dump"
    if engine == "django.db.backends.sqlite3":
        source = connections["default"]
        source.ensure_connection()
        with sqlite3.connect(destination) as target:
            source.connection.backup(target)
        return "sqlite", "database.sqlite3"
    raise BackupError("This database engine is not supported for full backups.")


def _media_files(root):
    if not root.exists():
        return
    if root.is_symlink() or not root.is_dir():
        raise BackupError("The media directory is unavailable or is a symbolic link.")
    for current, directories, filenames in os.walk(root, followlinks=False):
        for name in directories:
            if (Path(current) / name).is_symlink():
                raise BackupError("A symbolic link was found in the media directory.")
        for name in filenames:
            path = Path(current) / name
            if path.is_symlink() or not path.is_file():
                raise BackupError("A media entry is not a regular file.")
            yield path


def _photo_extension(source):
    try:
        with Image.open(source) as image:
            extension = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}.get(image.format, ".bin")
    except (OSError, UnidentifiedImageError):
        extension = ".bin"
    source.seek(0)
    return extension


def _copy_media(archive, source, destination):
    with source.open("rb") as input_file, archive.open(destination, "w", force_zip64=True) as output_file:
        shutil.copyfileobj(input_file, output_file)


def create_full_backup():
    """Return a seekable ZIP. Caller must close it after sending the response."""
    output = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    try:
        with tempfile.TemporaryDirectory(prefix="airway-backup-") as temporary:
            dump_path = Path(temporary) / "database"
            engine, dump_name = _dump_database(dump_path)
            media_root = Path(settings.MEDIA_ROOT)
            with ZipFile(output, "w", compression=ZIP_STORED, allowZip64=True) as archive:
                archive.write(dump_path, dump_name, compress_type=ZIP_STORED if engine == "postgresql" else ZIP_DEFLATED)
                manifest = {
                    "format_version": 2,
                    "created_at": timezone.now().isoformat(),
                    "database_engine": engine,
                    "database_file": dump_name,
                    "cases": [],
                    "media_files": [],
                }
                stored_media = set()
                used_labels = defaultdict(int)
                cases = Assessment.objects.select_related("device").prefetch_related("photos").order_by("created_at", "id")
                for case in cases.iterator(chunk_size=100):
                    label = case.case_label
                    used_labels[label] += 1
                    if used_labels[label] > 1:
                        label = f"{label}-{used_labels[label]:02d}"
                    folder = f"cases/{label}"
                    data = dict(AssessmentSerializer(case).data)
                    data["doctor_name"] = case.device.doctor_name
                    data["device_id"] = str(case.device_id)
                    data["export_label"] = label
                    data["field_labels"] = {
                        key: value.replace(case.case_label, label, 1)
                        for key, value in data["field_labels"].items()
                    }
                    fields = {display: data[key] for key, display in data["field_labels"].items()}
                    write_json(archive, f"{folder}/{label}-Fields.json", fields)
                    positions = defaultdict(int)
                    photo_entries = []
                    for photo in sorted(case.photos.all(), key=lambda item: (item.position, str(item.id))):
                        storage_name = photo.image.name
                        source = media_root / storage_name
                        if not source.is_file() or not source.resolve().is_relative_to(media_root.resolve()):
                            raise BackupError("A database photo file is missing from media; full backup was cancelled.")
                        with source.open("rb") as image_file:
                            extension = _photo_extension(image_file)
                        positions[photo.position] += 1
                        filename = f"{label}-Photo-{photo.position}-{positions[photo.position]:02d}{extension}"
                        archive_path = f"{folder}/{filename}"
                        _copy_media(archive, source, archive_path)
                        stored_media.add(storage_name)
                        manifest["media_files"].append({"archive_path": archive_path, "storage_path": storage_name})
                        photo_entries.append({"id": str(photo.id), "position": photo.position, "file": filename})
                    data["photos"] = photo_entries
                    write_json(archive, f"{folder}/{label}-Case.json", data)
                    manifest["cases"].append({"id": str(case.id), "folder": folder, "is_complete": case.is_complete})
                for path in _media_files(media_root):
                    storage_name = path.relative_to(media_root).as_posix()
                    if storage_name in stored_media:
                        continue
                    archive_path = f"unlinked-media/{storage_name}"
                    _copy_media(archive, path, archive_path)
                    manifest["media_files"].append({"archive_path": archive_path, "storage_path": storage_name})
                manifest["media_file_count"] = len(manifest["media_files"])
                write_json(archive, "backup.json", manifest)
        output.seek(0)
        return output
    except Exception:
        output.close()
        raise
