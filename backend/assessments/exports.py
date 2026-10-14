"""Readable ZIP dataset exports, independent of internal UUID storage names."""

import json
import shutil
import tempfile
from collections import defaultdict
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

from .images import normalize_photo
from .serializers import AssessmentSerializer


def write_json(archive, name, value):
    archive.writestr(name, json.dumps(value, ensure_ascii=False, indent=2), compress_type=ZIP_DEFLATED)


def export_assessments(queryset):
    # Large exports spill to disk instead of occupying a Gunicorn worker's RAM.
    output = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    manifest = {"schema_version": "1.0", "exported_at": timezone.now().isoformat(), "cases": []}
    used_labels = defaultdict(int)
    try:
        with ZipFile(output, "w", compression=ZIP_STORED, allowZip64=True) as archive:
            cases = queryset.select_related("device").prefetch_related("photos").order_by("created_at", "id")
            for case in cases.iterator(chunk_size=100):
                label = case.case_label
                used_labels[label] += 1
                if used_labels[label] > 1:
                    label = f"{label}-{used_labels[label]:02d}"
                data = dict(AssessmentSerializer(case).data)
                data["doctor_name"] = case.device.doctor_name
                data["device_id"] = str(case.device_id)
                data["export_label"] = label
                data["field_labels"] = {
                    key: value.replace(case.case_label, label, 1)
                    for key, value in data["field_labels"].items()
                }
                fields = {display: data[key] for key, display in data["field_labels"].items()}
                write_json(archive, f"{label}/{label}-Fields.json", fields)
                positions = defaultdict(int)
                photo_entries = []
                for photo in sorted(case.photos.all(), key=lambda item: (item.position, str(item.id))):
                    positions[photo.position] += 1
                    filename = f"{label}-Photo-{photo.position}-{positions[photo.position]:02d}.jpg"
                    path = str(PurePosixPath(label, filename))
                    try:
                        with photo.image.open("rb") as source:
                            with Image.open(source) as image:
                                is_jpeg = image.format == "JPEG"
                            source.seek(0)
                            # Avoid repeated JPEG recompression; convert legacy PNG/WebP uploads.
                            content = source if is_jpeg else normalize_photo(source)
                            with archive.open(path, "w", force_zip64=True) as destination:
                                shutil.copyfileobj(content, destination)
                            if content is not source:
                                content.close()
                    except (OSError, UnidentifiedImageError) as exc:
                        raise ValidationError("An image file is missing or unreadable; restore the media backup before exporting.") from exc
                    photo_entries.append({"id": str(photo.id), "position": photo.position, "file": filename})
                data["photos"] = photo_entries
                write_json(archive, f"{label}/{label}-Case.json", data)
                manifest["cases"].append({"id": str(case.id), "folder": label, "is_complete": case.is_complete})
            write_json(archive, "manifest.json", manifest)
        output.seek(0)
        return output
    except Exception:
        output.close()
        raise
