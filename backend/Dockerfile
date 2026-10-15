FROM python:3.14-slim-trixie AS dependencies
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --index-url "$PIP_INDEX_URL" \
       --timeout 30 --retries 2 -r requirements.txt

FROM python:3.14-slim-trixie AS runtime
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://security.debian.org/debian-security
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# Trixie supplies PostgreSQL 17 client tools, matching the Compose database.
# Host APT settings and Docker Hub registry mirrors do not affect image builds.
# Keep Debian's Signed-By keyring and suites when changing only repository URLs.
RUN python - <<'PY'
import os
from pathlib import Path

sources = Path('/etc/apt/sources.list.d/debian.sources')
text = sources.read_text()
text = text.replace('http://deb.debian.org/debian-security', os.environ['DEBIAN_SECURITY_MIRROR'].rstrip('/'))
text = text.replace('http://deb.debian.org/debian', os.environ['DEBIAN_MIRROR'].rstrip('/'))
sources.write_text(text)
PY
RUN apt-get update -o APT::Update::Error-Mode=any \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 airway \
    && useradd --uid 10001 --gid airway --no-create-home airway \
    && mkdir -p /data/media /data/static \
    && chown -R airway:airway /data && chmod 700 /data/media
COPY --from=dependencies /opt/venv /opt/venv
WORKDIR /app
COPY --chown=airway:airway backend/ .
USER airway
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import json, urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4))['database_ready'] is True"
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "600", "--access-logfile", "-", "--error-logfile", "-", "config.wsgi:application"]
