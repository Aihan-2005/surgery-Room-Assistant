import hashlib
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import Device


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class DeviceTokenAuthentication(BaseAuthentication):
    """Expects header:  Authorization: Device <token>
    On success request.user is the Device instance."""

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Device "):
            return None
        token = header[len("Device "):].strip()
        try:
            device = Device.objects.get(token_hash=hash_token(token), is_active=True)
        except Device.DoesNotExist:
            raise AuthenticationFailed("Invalid or disabled device token.")
        return (device, None)

    def authenticate_header(self, request):
        return "Device"