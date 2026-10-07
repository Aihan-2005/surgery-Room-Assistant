"""
Django settings for the assessments backend (Django 6.1).

Everything that differs between your laptop and the server comes from
environment variables - see env.example for the full list.
"""
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")  # local development only; on the server use real environment variables


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


# ---------------------------------------------------------------- core
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"  # off unless explicitly enabled

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or ("dev-only-insecure-key" if DEBUG else None)
if not SECRET_KEY:
    raise ImproperlyConfigured("Set the DJANGO_SECRET_KEY environment variable.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "assessments",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # must stay first
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ------------------------------------------------------------ database
if os.environ.get("DB_NAME"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["DB_NAME"],
            "USER": os.environ.get("DB_USER", ""),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }
elif DEBUG:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
else:
    raise ImproperlyConfigured("Set DB_NAME (and DB_USER / DB_PASSWORD) for PostgreSQL.")

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------- static & media
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # `collectstatic` target; Nginx serves it in production

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT") or BASE_DIR / "media")  # patient photos

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# This app sends no email. Console backend while developing, "dummy" (discard) in production.
MAILERS = {
    "default": {
        "BACKEND": (
            "django.core.mail.backends.console.EmailBackend"
            if DEBUG
            else "django.core.mail.backends.dummy.EmailBackend"
        ),
    },
}

# ------------------------------------------------- REST framework / CORS
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["assessments.authentication.DeviceTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    # Registration limit is per IP. A hospital shares one public IP, so raise it
    # (REGISTER_RATE=30/hour) if many doctors will register at the same time.
    "DEFAULT_THROTTLE_RATES": {"register": os.environ.get("REGISTER_RATE", "10/hour")},
    # Number of reverse proxies in front of Django (Nginx = 1). Without this, every
    # request would look like it comes from 127.0.0.1 and share ONE rate limit.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "0")),
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")

# ------------------------------------------------------ HTTPS hardening
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # Nginx must send this header
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("HSTS_SECONDS", "3600"))  # raise to 31536000 once HTTPS works
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = False
    CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")  # e.g. https://api.your-domain.com

# security.W021: HSTS preload is a deliberate opt-in (hard to undo).
# mail.E001: this app sends no email, so a non-SMTP mail backend is fine.
# Remove mail.E001 from this list if you ever add email and configure SMTP.
SILENCED_SYSTEM_CHECKS = ["security.W021", "mail.E001"]