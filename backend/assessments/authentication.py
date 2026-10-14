import hashlib
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from .models import Device


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_recovery_key(key: str) -> str:
    return hashlib.sha256(f"device-recovery:{key}".encode()).hexdigest()


class DeviceTokenAuthentication(BaseAuthentication):
    """Expects header:  Authorization: Device <token>
    On success request.user is the Device instance."""

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Device "):
            return None
        token = header[len("Device "):].strip()
        try:
            device = Device.objects.get(token_hash=hash_token(token))
        except Device.DoesNotExist:
            raise AuthenticationFailed("Invalid device token.")
        if not device.is_active:
            # The existing frontend re-registers on 401. A deliberate block is
            # forbidden, rather than a token-recovery event.
            raise PermissionDenied("This device has been disabled. Contact the administrator.", code="device_disabled")
        return (device, None)

    def authenticate_header(self, request):
        return "Device"
