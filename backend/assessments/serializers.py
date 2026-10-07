from rest_framework import serializers
from .models import Assessment, AssessmentPhoto

MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB (the app compresses before upload)


class DeviceRegisterSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    doctor_name = serializers.CharField(max_length=100)


class AssessmentSerializer(serializers.ModelSerializer):
    photo_count = serializers.SerializerMethodField()

    class Meta:
        model = Assessment
        fields = [
            "id", "full_name", "age", "sex", "height_cm", "weight_kg",
            "neck_movement",
            "created_at", "received_at", "is_complete", "photo_count",
        ]
        read_only_fields = ["id", "received_at", "is_complete", "photo_count"]

    def get_photo_count(self, obj):
        return obj.photos.count()


class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentPhoto
        fields = ["id", "position", "image"]
        read_only_fields = ["id"]

    def validate_image(self, image):
        if image.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError("Image is too large (max 5 MB).")
        return image