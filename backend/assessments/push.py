import json
import logging

from django.conf import settings
from django.utils import timezone

from pywebpush import (
    WebPushException,
    webpush,
)

from .models import (
    Device,
    PushSubscription,
)


logger = logging.getLogger(
    __name__
)


class PushConfigurationError(
    RuntimeError
):
    pass


SYNC_REMINDER_PAYLOAD = {
    "title":
        "یادآوری ارسال",

    "body":
        (
            "مواردی در انتظار ارسال دارید. "
            "برنامه را باز کنید."
        ),

    "url":
        "/queue",

    "type":
        "sync-reminder",
}


PUSH_TEST_PAYLOAD = {
    "title": "اعلان آزمایشی",
    "body": "اتصال اعلان این دستگاه به سرور برقرار است.",
    "url": "/queue",
    "type": "push-test",
}


def push_is_configured():
    return bool(
        settings.WEB_PUSH_ENABLED
    )


def _mark_success(
    subscription:
        PushSubscription,
):
    now = timezone.now()

    PushSubscription.objects.filter(
        pk=subscription.pk
    ).update(
        failure_count=0,
        last_success_at=now,
        updated_at=now,
    )


def _mark_failure(
    subscription:
        PushSubscription,

    *,
    deactivate:
        bool,
):
    now = timezone.now()

    updates = {
        "failure_count":
            subscription.failure_count + 1,

        "last_failure_at":
            now,

        "updated_at":
            now,
    }

    if deactivate:
        updates[
            "is_active"
        ] = False

    PushSubscription.objects.filter(
        pk=subscription.pk
    ).update(
        **updates
    )


def send_sync_reminder(
    subscription:
        PushSubscription,
    *,
    payload=None,
):
    """
    Send a generic notification.

    No patient name, case UUID, photo metadata or other
    medical data is placed in the notification payload.
    """

    if not push_is_configured():
        raise PushConfigurationError(
            "Web Push is not configured."
        )

    if not subscription.is_active:
        return {
            "sent":
                False,

            "inactive":
                True,
        }

    subscription_info = {
        "endpoint":
            subscription.endpoint,

        "keys": {
            "p256dh":
                subscription.p256dh,

            "auth":
                subscription.auth,
        },
    }

    try:
        webpush(
            subscription_info=
                subscription_info,

            data=json.dumps(
                payload if payload is not None else SYNC_REMINDER_PAYLOAD,
                ensure_ascii=False,
            ),

            vapid_private_key=(
                settings
                .WEB_PUSH_VAPID_PRIVATE_KEY
            ),

            vapid_claims={
                "sub":
                    settings
                    .WEB_PUSH_VAPID_SUBJECT,
            },

            ttl=(
                settings
                .WEB_PUSH_TTL_SECONDS
            ),

            timeout=(
                settings
                .WEB_PUSH_TIMEOUT_SECONDS
            ),
        )

    except WebPushException as exc:
        response = getattr(
            exc,
            "response",
            None,
        )

        status_code = getattr(
            response,
            "status_code",
            None,
        )

        #Push services return 404/410 when the browser
        # subscription is no longer valid.
    
        deactivate = (
            status_code in {
                404,
                410,
            }
        )

        _mark_failure(
            subscription,
            deactivate=deactivate,
        )

        logger.warning(
            (
                "Web Push failed "
                "subscription=%s "
                "status=%s"
            ),
            subscription.pk,
            status_code,
        )

        return {
            "sent":
                False,

            "status":
                status_code,

            "deactivated":
                deactivate,
        }

    except Exception:
        _mark_failure(
            subscription,
            deactivate=False,
        )

        logger.exception(
            "Unexpected Web Push failure."
        )

        return {
            "sent":
                False,

            "status":
                None,

            "deactivated":
                False,
        }

    _mark_success(
        subscription
    )

    return {
        "sent":
            True,

        "status":
            201,

        "deactivated":
            False,
    }


def send_sync_reminder_to_device(
    device:
        Device,
    *,
    test=False,
):
    if not push_is_configured():
        raise PushConfigurationError(
            "Web Push is not configured."
        )

    subscriptions = list(
        device
        .push_subscriptions
        .filter(
            is_active=True
        )
        .order_by(
            "-updated_at"
        )
    )

    sent = 0
    failed = 0
    deactivated = 0

    for subscription in subscriptions:
        result = send_sync_reminder(
            subscription,
            payload=PUSH_TEST_PAYLOAD if test else SYNC_REMINDER_PAYLOAD,
        )

        if result.get(
            "sent"
        ):
            sent += 1
        else:
            failed += 1

        if result.get(
            "deactivated"
        ):
            deactivated += 1

    return {
        "active_subscriptions":
            len(
                subscriptions
            ),

        "sent":
            sent,

        "failed":
            failed,

        "deactivated":
            deactivated,
    }