FROM python:3.14-slim-trixie AS dependencies
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.14-slim-trixie AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
# Trixie supplies PostgreSQL 17 client tools, matching the Compose database.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
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
