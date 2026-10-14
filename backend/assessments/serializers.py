from rest_framework import serializers
from django.conf import settings
from .images import normalize_photo
from .models import Assessment, AssessmentPhoto

MAX_IMAGE_BYTES = settings.PHOTO_MAX_UPLOAD_BYTES


class DeviceRegisterSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    doctor_name = serializers.CharField(max_length=100)


class DeviceRecoverSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    recovery_key = serializers.CharField(max_length=100, trim_whitespace=False)


class AssessmentSerializer(serializers.ModelSerializer):
    photo_count = serializers.SerializerMethodField()
    case_label = serializers.CharField(read_only=True)
    field_labels = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id", "case_label", "field_labels", "full_name", "age", "sex", "height_cm", "weight_kg",
            "neck_movement", "previous_difficult_intubation",
            "created_at", "received_at", "is_complete", "photo_count",
        ]
        read_only_fields = ["id", "case_label", "field_labels", "received_at", "is_complete", "photo_count"]

    def get_photo_count(self, obj):
        return obj.photos.count()

    def get_field_labels(self, obj):
        titles = {
            "full_name": "PatientName", "age": "Age", "sex": "Sex",
            "height_cm": "HeightCm", "weight_kg": "WeightKg",
            "neck_movement": "NeckMovement",
            "previous_difficult_intubation": "PreviousDifficultIntubation",
        }
        return {field: f"{obj.case_label}-{title}" for field, title in titles.items()}


class PhotoSerializer(serializers.ModelSerializer):
    # Decode in normalize_photo, where byte/pixel limits and conversion are applied.
    image = serializers.FileField()

    class Meta:
        model = AssessmentPhoto
        fields = ["id", "position", "image"]
        read_only_fields = ["id"]

    def validate_image(self, image):
        if image.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError(f"Image is too large (max {MAX_IMAGE_BYTES} bytes).")
        return normalize_photo(image)
