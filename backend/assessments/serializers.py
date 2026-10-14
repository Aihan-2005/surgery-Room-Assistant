from django.conf import settings

from rest_framework import serializers

from .images import normalize_photo

from .models import (
    Assessment,
    AssessmentPhoto,
)


MAX_IMAGE_BYTES = (
    settings.PHOTO_MAX_UPLOAD_BYTES
)


class DeviceRegisterSerializer(
    serializers.Serializer
):
    device_id = serializers.UUIDField()

    doctor_name = serializers.CharField(
        max_length=100
    )


class DeviceRecoverSerializer(
    serializers.Serializer
):
    device_id = serializers.UUIDField()

    recovery_key = serializers.CharField(
        max_length=100,
        trim_whitespace=False,
    )


class AssessmentSerializer(
    serializers.ModelSerializer
):
    photo_count = (
        serializers.SerializerMethodField()
    )

    case_label = serializers.CharField(
        read_only=True
    )

    field_labels = (
        serializers.SerializerMethodField()
    )

    class Meta:
        model = Assessment

        fields = [
            "id",
            "case_label",
            "field_labels",
            "full_name",
            "age",
            "sex",
            "height_cm",
            "weight_kg",
            "neck_movement",
            "previous_difficult_intubation",
            "created_at",
            "received_at",
            "is_complete",
            "photo_count",
        ]

        read_only_fields = [
            "id",
            "case_label",
            "field_labels",
            "received_at",
            "is_complete",
            "photo_count",
        ]

    def get_photo_count(
        self,
        obj,
    ):
        return obj.photos.count()

    def get_field_labels(
        self,
        obj,
    ):
        titles = {
            "full_name":
                "PatientName",

            "age":
                "Age",

            "sex":
                "Sex",

            "height_cm":
                "HeightCm",

            "weight_kg":
                "WeightKg",

            "neck_movement":
                "NeckMovement",

            "previous_difficult_intubation":
                "PreviousDifficultIntubation",
        }

        return {
            field:
                f"{obj.case_label}-{title}"

            for (
                field,
                title,
            ) in titles.items()
        }


class PhotoSerializer(
    serializers.ModelSerializer
):
    image = serializers.FileField()

    class Meta:
        model = AssessmentPhoto

        fields = [
            "id",
            "position",
            "image",
        ]

        read_only_fields = [
            "id"
        ]

    def validate_image(
        self,
        image,
    ):
        if (
            image.size >
            MAX_IMAGE_BYTES
        ):
            raise serializers.ValidationError(
                (
                    "Image is too large "
                    f"(max {MAX_IMAGE_BYTES} bytes)."
                )
            )

        return normalize_photo(
            image
        )


# ---------------------------------------------------------------------------
# Web Push
# ---------------------------------------------------------------------------

class PushKeysSerializer(
    serializers.Serializer
):
    p256dh = serializers.CharField(
        max_length=512,
        trim_whitespace=False,
    )

    auth = serializers.CharField(
        max_length=255,
        trim_whitespace=False,
    )

    def validate_p256dh(
        self,
        value,
    ):
        if not value:
            raise serializers.ValidationError(
                "p256dh is required."
            )

        return value

    def validate_auth(
        self,
        value,
    ):
        if not value:
            raise serializers.ValidationError(
                "auth is required."
            )

        return value


class PushSubscriptionSerializer(
    serializers.Serializer
):
    """
    Accepts the structure produced by:

        PushSubscription.toJSON()

    {
        "endpoint": "...",
        "expirationTime": null,
        "keys": {
            "p256dh": "...",
            "auth": "..."
        }
    }
    """

    endpoint = serializers.URLField(
        max_length=2048
    )

    expirationTime = (
        serializers.IntegerField(
            required=False,
            allow_null=True,
            min_value=0,
        )
    )

    keys = PushKeysSerializer()

    def validate_endpoint(
        self,
        value,
    ):
        if not value.startswith(
            "https://"
        ):
            raise serializers.ValidationError(
                "Push endpoint must use HTTPS."
            )

        return value


class PushUnsubscribeSerializer(
    serializers.Serializer
):
    endpoint = serializers.URLField(
        max_length=2048
    )