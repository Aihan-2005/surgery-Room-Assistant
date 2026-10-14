


import os

from pathlib import Path

from django.core.exceptions import (
    ImproperlyConfigured,
)

from dotenv import (
    load_dotenv,
)


BASE_DIR = (
    Path(
        __file__
    )
    .resolve()
    .parent
    .parent
)

load_dotenv(
    BASE_DIR /
    ".env"
)


def env_list(
    name,
    default="",
):
    return [
        item.strip()

        for item
        in os.environ
        .get(
            name,
            default,
        )
        .split(",")

        if item.strip()
    ]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

DEBUG = (
    os.environ
    .get(
        "DJANGO_DEBUG",
        "0",
    )
    ==
    "1"
)


SECRET_KEY = (
    os.environ
    .get(
        "DJANGO_SECRET_KEY"
    )
    or
    (
        "dev-only-insecure-key"
        if DEBUG
        else None
    )
)

if not SECRET_KEY:
    raise ImproperlyConfigured(
        (
            "Set the DJANGO_SECRET_KEY "
            "environment variable."
        )
    )


ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "localhost,127.0.0.1",
)


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


if DEBUG:
    INSTALLED_APPS += [
        "django_extensions"
    ]


MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",

    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = (
    "config.urls"
)


TEMPLATES = [
    {
        "BACKEND":
            (
                "django.template.backends."
                "django.DjangoTemplates"
            ),

        "DIRS":
            [],

        "APP_DIRS":
            True,

        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


WSGI_APPLICATION = (
    "config.wsgi.application"
)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

if os.environ.get(
    "DB_NAME"
):
    DATABASES = {
        "default": {
            "ENGINE":
                "django.db.backends.postgresql",

            "NAME":
                os.environ[
                    "DB_NAME"
                ],

            "USER":
                os.environ.get(
                    "DB_USER",
                    "",
                ),

            "PASSWORD":
                os.environ.get(
                    "DB_PASSWORD",
                    "",
                ),

            "HOST":
                os.environ.get(
                    "DB_HOST",
                    "localhost",
                ),

            "PORT":
                os.environ.get(
                    "DB_PORT",
                    "5432",
                ),
        }
    }

elif DEBUG:
    DATABASES = {
        "default": {
            "ENGINE":
                "django.db.backends.sqlite3",

            "NAME":
                BASE_DIR /
                "db.sqlite3",
        }
    }

else:
    raise ImproperlyConfigured(
        (
            "Set DB_NAME "
            "(and DB_USER / DB_PASSWORD) "
            "for PostgreSQL."
        )
    )


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME":
            (
                "django.contrib.auth."
                "password_validation."
                "UserAttributeSimilarityValidator"
            )
    },

    {
        "NAME":
            (
                "django.contrib.auth."
                "password_validation."
                "MinimumLengthValidator"
            )
    },

    {
        "NAME":
            (
                "django.contrib.auth."
                "password_validation."
                "CommonPasswordValidator"
            )
    },

    {
        "NAME":
            (
                "django.contrib.auth."
                "password_validation."
                "NumericPasswordValidator"
            )
    },
]


LANGUAGE_CODE = (
    "en-us"
)

TIME_ZONE = (
    "UTC"
)

USE_I18N = (
    True
)

USE_TZ = (
    True
)


# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------

STATIC_URL = (
    "/static/"
)

STATIC_ROOT = Path(
    os.environ.get(
        "STATIC_ROOT"
    )
    or
    BASE_DIR /
    "staticfiles"
)


MEDIA_URL = (
    "/media/"
)

MEDIA_ROOT = Path(
    os.environ.get(
        "MEDIA_ROOT"
    )
    or
    BASE_DIR /
    "media"
)


PG_DUMP_PATH = (
    os.environ.get(
        "PG_DUMP_PATH",
        "",
    )
)


PHOTO_JPEG_QUALITY = int(
    os.environ.get(
        "PHOTO_JPEG_QUALITY",
        "90",
    )
)

PHOTO_MAX_UPLOAD_BYTES = int(
    os.environ.get(
        "PHOTO_MAX_UPLOAD_BYTES",
        str(
            5 *
            1024 *
            1024
        ),
    )
)

PHOTO_MAX_PIXELS = int(
    os.environ.get(
        "PHOTO_MAX_PIXELS",
        "40000000",
    )
)


if not (
    1 <=
    PHOTO_JPEG_QUALITY <=
    95
):
    raise ImproperlyConfigured(
        (
            "PHOTO_JPEG_QUALITY must "
            "be between 1 and 95."
        )
    )


if (
    PHOTO_MAX_UPLOAD_BYTES <=
        0 or
    PHOTO_MAX_PIXELS <=
        0
):
    raise ImproperlyConfigured(
        (
            "Photo upload and pixel "
            "limits must be positive."
        )
    )


DEFAULT_AUTO_FIELD = (
    "django.db.models.BigAutoField"
)


# ---------------------------------------------------------------------------
# Web Push / VAPID
# ---------------------------------------------------------------------------

WEB_PUSH_VAPID_PUBLIC_KEY = (
    os.environ
    .get(
        "WEB_PUSH_VAPID_PUBLIC_KEY",
        "",
    )
    .strip()
)

WEB_PUSH_VAPID_PRIVATE_KEY = (
    os.environ
    .get(
        "WEB_PUSH_VAPID_PRIVATE_KEY",
        "",
    )
    .strip()
)

WEB_PUSH_VAPID_SUBJECT = (
    os.environ
    .get(
        "WEB_PUSH_VAPID_SUBJECT",
        "",
    )
    .strip()
)


_push_values = [
    WEB_PUSH_VAPID_PUBLIC_KEY,
    WEB_PUSH_VAPID_PRIVATE_KEY,
    WEB_PUSH_VAPID_SUBJECT,
]


if (
    any(
        _push_values
    ) and
    not all(
        _push_values
    )
):
    raise ImproperlyConfigured(
        (
            "Web Push configuration is incomplete. "
            "Set WEB_PUSH_VAPID_PUBLIC_KEY, "
            "WEB_PUSH_VAPID_PRIVATE_KEY and "
            "WEB_PUSH_VAPID_SUBJECT together."
        )
    )


WEB_PUSH_ENABLED = all(
    _push_values
)


if (
    WEB_PUSH_ENABLED and
    not (
        WEB_PUSH_VAPID_SUBJECT
        .startswith(
            "mailto:"
        )
        or
        WEB_PUSH_VAPID_SUBJECT
        .startswith(
            "https://"
        )
    )
):
    raise ImproperlyConfigured(
        (
            "WEB_PUSH_VAPID_SUBJECT must "
            "start with mailto: or https://"
        )
    )


WEB_PUSH_TTL_SECONDS = int(
    os.environ.get(
        "WEB_PUSH_TTL_SECONDS",
        "300",
    )
)


WEB_PUSH_TIMEOUT_SECONDS = float(
    os.environ.get(
        "WEB_PUSH_TIMEOUT_SECONDS",
        "10",
    )
)


if (
    WEB_PUSH_TTL_SECONDS <
        0 or
    WEB_PUSH_TIMEOUT_SECONDS <=
        0
):
    raise ImproperlyConfigured(
        (
            "Web Push TTL and timeout "
            "must be valid positive values."
        )
    )


# ---------------------------------------------------------------------------
# Mail
# ---------------------------------------------------------------------------

MAILERS = {
    "default": {
        "BACKEND":
            (
                "django.core.mail.backends."
                "console.EmailBackend"
                if DEBUG
                else
                "django.core.mail.backends."
                "dummy.EmailBackend"
            ),
    },
}


# ---------------------------------------------------------------------------
# REST / CORS
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        (
            "assessments.authentication."
            "DeviceTokenAuthentication"
        )
    ],

    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated"
    ],

    "DEFAULT_THROTTLE_CLASSES": [
        (
            "rest_framework.throttling."
            "ScopedRateThrottle"
        )
    ],

    "DEFAULT_THROTTLE_RATES": {
        "register":
            os.environ.get(
                "REGISTER_RATE",
                "10/hour",
            ),

        "recover":
            os.environ.get(
                "RECOVER_RATE",
                "10/hour",
            ),

        "push":
            os.environ.get(
                "PUSH_RATE",
                "60/hour",
            ),

        "push_test":
            os.environ.get(
                "PUSH_TEST_RATE",
                "10/hour",
            ),
    },

    "NUM_PROXIES":
        int(
            os.environ.get(
                "NUM_PROXIES",
                "0",
            )
        ),
}


CORS_ALLOWED_ORIGINS = (
    env_list(
        "CORS_ALLOWED_ORIGINS"
    )
)


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

CACHES = {
    "default": {
        "BACKEND":
            os.environ.get(
                "CACHE_BACKEND",
                (
                    "django.core.cache.backends."
                    "locmem.LocMemCache"
                ),
            ),

        "LOCATION":
            os.environ.get(
                "CACHE_LOCATION",
                "airway-assistant",
            ),
    }
}


# ---------------------------------------------------------------------------
# HTTPS hardening
# ---------------------------------------------------------------------------

if not DEBUG:
    SECURE_SSL_REDIRECT = (
        True
    )

    SECURE_PROXY_SSL_HEADER = (
        "HTTP_X_FORWARDED_PROTO",
        "https",
    )

    SESSION_COOKIE_SECURE = (
        True
    )

    CSRF_COOKIE_SECURE = (
        True
    )

    SECURE_HSTS_SECONDS = int(
        os.environ.get(
            "HSTS_SECONDS",
            "3600",
        )
    )

    SECURE_HSTS_INCLUDE_SUBDOMAINS = (
        True
    )

    SECURE_HSTS_PRELOAD = (
        False
    )

    CSRF_TRUSTED_ORIGINS = (
        env_list(
            "CSRF_TRUSTED_ORIGINS"
        )
    )


SILENCED_SYSTEM_CHECKS = [
    "security.W021",
    "mail.E001",
]