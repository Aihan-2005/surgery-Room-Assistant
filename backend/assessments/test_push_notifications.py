import json
import uuid

from unittest.mock import patch

from django.core.cache import cache
from django.test import override_settings

from rest_framework.test import (
    APIClient,
    APITestCase,
)

from .authentication import hash_token
from .models import Device, PushSubscription


PUSH_SETTINGS = {
    "WEB_PUSH_ENABLED": True,
    "WEB_PUSH_VAPID_PUBLIC_KEY": "test-public-key",
    "WEB_PUSH_VAPID_PRIVATE_KEY": "test-private-key",
    "WEB_PUSH_VAPID_SUBJECT": "mailto:test@example.com",
    "WEB_PUSH_TTL_SECONDS": 300,
    "WEB_PUSH_TIMEOUT_SECONDS": 10,
}


@override_settings(**PUSH_SETTINGS)
class PushNotificationTests(APITestCase):

    def setUp(self):
        cache.clear()

        self.token = "test-device-token"

        self.device = Device.objects.create(
            id=uuid.uuid4(),
            doctor_name="Dr Test",
            token_hash=hash_token(self.token),
        )

        self.client = APIClient()

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Device {self.token}"
        )

        self.endpoint = (
            "https://push.example.test/"
            "subscription-123"
        )

        self.subscription_data = {
            "endpoint": self.endpoint,
            "expirationTime": None,
            "keys": {
                "p256dh": "test-p256dh",
                "auth": "test-auth",
            },
        }

    def register_subscription(self):
        return self.client.post(
            "/api/push/subscriptions/",
            self.subscription_data,
            format="json",
        )

    def test_config_exposes_only_public_key(self):
        response = self.client.get(
            "/api/push/config/"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertTrue(
            response.data["enabled"]
        )

        self.assertEqual(
            response.data["public_key"],
            "test-public-key",
        )

        self.assertNotIn(
            "private_key",
            response.data,
        )

    def test_subscription_requires_token(self):
        anonymous = APIClient()

        response = anonymous.post(
            "/api/push/subscriptions/",
            self.subscription_data,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            401,
        )

    def test_subscription_is_registered(self):
        response = self.register_subscription()

        self.assertEqual(
            response.status_code,
            201,
        )

        saved = PushSubscription.objects.get(
            endpoint=self.endpoint
        )

        self.assertEqual(
            saved.device_id,
            self.device.id,
        )

        self.assertTrue(
            saved.is_active
        )

        self.assertEqual(
            saved.p256dh,
            "test-p256dh",
        )

    def test_registration_is_idempotent(self):
        first = self.register_subscription()
        second = self.register_subscription()

        self.assertEqual(
            first.status_code,
            201,
        )

        self.assertEqual(
            second.status_code,
            200,
        )

        self.assertEqual(
            PushSubscription.objects.filter(
                endpoint=self.endpoint
            ).count(),
            1,
        )

    def test_other_device_cannot_claim_endpoint(self):
        self.register_subscription()

        other_token = "other-test-token"

        Device.objects.create(
            id=uuid.uuid4(),
            doctor_name="Dr Other",
            token_hash=hash_token(other_token),
        )

        other_client = APIClient()

        other_client.credentials(
            HTTP_AUTHORIZATION=(
                f"Device {other_token}"
            )
        )

        response = other_client.post(
            "/api/push/subscriptions/",
            self.subscription_data,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            409,
        )

    @patch("assessments.push.webpush")
    def test_real_push_pipeline_calls_webpush(
        self,
        mocked_webpush,
    ):
        self.register_subscription()

        response = self.client.post(
            "/api/push/test/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.data["sent"],
            1,
        )

        mocked_webpush.assert_called_once()

        kwargs = mocked_webpush.call_args.kwargs

        payload = json.loads(
            kwargs["data"]
        )

        self.assertEqual(
            payload["url"],
            "/queue",
        )

        self.assertEqual(
            payload["type"],
            "sync-reminder",
        )

        self.assertNotIn(
            "patient",
            payload,
        )

        self.assertNotIn(
            "case_id",
            payload,
        )

        self.assertNotIn(
            "photos",
            payload,
        )

    def test_test_endpoint_without_subscription(self):
        response = self.client.post(
            "/api/push/test/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            409,
        )

        self.assertEqual(
            response.data["code"],
            "NO_ACTIVE_PUSH_SUBSCRIPTION",
        )

    def test_unsubscribe(self):
        self.register_subscription()

        response = self.client.delete(
            "/api/push/subscriptions/",
            {
                "endpoint": self.endpoint,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            204,
        )

        self.assertFalse(
            PushSubscription.objects.filter(
                endpoint=self.endpoint
            ).exists()
        )

    @override_settings(
        WEB_PUSH_ENABLED=False,
        WEB_PUSH_VAPID_PUBLIC_KEY="",
    )
    def test_disabled_push_configuration(self):
        response = self.client.get(
            "/api/push/config/"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertFalse(
            response.data["enabled"]
        )

        self.assertIsNone(
            response.data["public_key"]
        )