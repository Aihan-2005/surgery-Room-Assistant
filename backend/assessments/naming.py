"""Portable labels for database records and future ZIP exports."""

import re
import unicodedata
from datetime import timezone


def make_case_label(full_name, created_at):
    name = unicodedata.normalize("NFKC", full_name)
    name = re.sub(r"[^\w\s-]", "", name, flags=re.UNICODE)
    name = re.sub(r"[\s_-]+", "-", name).strip("-")
    # Linux limits each filename component in bytes, including Unicode names.
    name = name.encode("utf-8")[:100].decode("utf-8", errors="ignore").strip("-") or "Patient"
    timestamp = created_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    return f"{name}-{timestamp}"
