import secrets

from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Count
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from PIL import Image, UnidentifiedImageError
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import hash_recovery_key, hash_token
from .exports import export_assessments
from .models import Assessment, AssessmentPhoto, Device
from .serializers import (
    AssessmentSerializer, DeviceRecoverSerializer, DeviceRegisterSerializer, PhotoSerializer,
)

MIN_POSITIONS = 1
MIN_PER_POSITION = 1
MAX_PER_POSITION = 5


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "register"

    def post(self, request):
        serializer = DeviceRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device_id = serializer.validated_data["device_id"]
        token = secrets.token_urlsafe(32)
        recovery_key = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                Device.objects.create(
                    id=device_id,
                    doctor_name=serializer.validated_data["doctor_name"].strip(),
                    token_hash=hash_token(token),
                    recovery_key_hash=hash_recovery_key(recovery_key),
                )
        except IntegrityError:
            if not Device.objects.filter(id=device_id).exists():
                raise
            return Response(
                {"code": "DEVICE_ALREADY_REGISTERED",
                 "detail": "Device already registered. Recover the same device with its recovery key."},
                status=status.HTTP_409_CONFLICT,
            )
        response = Response(
            {"device_id": str(device_id), "token": token, "recovery_key": recovery_key},
            status=status.HTTP_201_CREATED,
        )
        response["Cache-Control"] = "no-store"
        return response


class DeviceRecoveryKeyView(APIView):
    """An authenticated existing installation can provision/replace its recovery key."""
    throttle_scope = "recover"

    def post(self, request):
        key = secrets.token_urlsafe(32)
        with transaction.atomic():
            device = get_object_or_404(Device.objects.select_for_update(), pk=request.user.id, is_active=True)
            device.recovery_key_hash = hash_recovery_key(key)
            device.save(update_fields=["recovery_key_hash"])
        response = Response({"device_id": str(device.id), "recovery_key": key})
        response["Cache-Control"] = "no-store"
        return response


class DeviceRecoverView(APIView):
    """Issue a new token without changing the UUID or ownership of existing cases."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "recover"

    def post(self, request):
        serializer = DeviceRecoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            device = Device.objects.select_for_update().filter(
                pk=serializer.validated_data["device_id"], is_active=True,
            ).first()
            expected = hash_recovery_key(serializer.validated_data["recovery_key"])
            if not device or not device.recovery_key_hash or not secrets.compare_digest(device.recovery_key_hash, expected):
                return Response(
                    {"code": "DEVICE_RECOVERY_FAILED", "detail": "Invalid recovery credentials or disabled device."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            token = secrets.token_urlsafe(32)
            device.token_hash = hash_token(token)
            device.save(update_fields=["token_hash"])
        response = Response({"device_id": str(device.id), "token": token})
        response["Cache-Control"] = "no-store"
        return response


class AssessmentListView(generics.ListAPIView):
    serializer_class = AssessmentSerializer

    def get_queryset(self):
        return Assessment.objects.filter(device=self.request.user).order_by("-created_at")


class AssessmentExportView(APIView):
    def get(self, request):
        archive = export_assessments(Assessment.objects.filter(device=request.user))
        response = FileResponse(archive, as_attachment=True, filename="airway-cases.zip", content_type="application/zip")
        response["Cache-Control"] = "private, no-store"
        return response


class AssessmentDetailView(APIView):
    """PUT = create-or-update with a stable case UUID; completed cases are immutable."""

    @transaction.atomic
    def put(self, request, pk):
        # Serialize requests for this device, including retries of a new case UUID.
        get_object_or_404(Device.objects.select_for_update(), pk=request.user.id, is_active=True)
        instance = Assessment.objects.select_for_update().filter(pk=pk).first()
        if instance and instance.device_id != request.user.id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if instance and instance.is_complete:
            return Response(AssessmentSerializer(instance).data)
        serializer = AssessmentSerializer(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(id=pk, device=request.user)
        return Response(serializer.data, status=status.HTTP_200_OK if instance else status.HTTP_201_CREATED)


class PhotoUploadView(APIView):
    parser_classes = [MultiPartParser]

    def get(self, request, pk, photo_id):
        photo = get_object_or_404(
            AssessmentPhoto, pk=photo_id, assessment_id=pk, assessment__device=request.user,
        )
        try:
            source = photo.image.open("rb")
            # Legacy uploads may contain PNG bytes under a .jpg filename.
            with Image.open(source) as image:
                content_type = Image.MIME.get(image.format, "application/octet-stream")
            source.seek(0)
        except (OSError, UnidentifiedImageError) as exc:
            photo.image.close()
            raise ValidationError("The photo file is unavailable. Restore it from the media backup.") from exc
        response = FileResponse(source, content_type=content_type)
        response["Cache-Control"] = "private, no-store"
        return response

    @transaction.atomic
    def put(self, request, pk, photo_id):
        # The parent lock is shared with completion and other photo uploads.
        assessment = get_object_or_404(Assessment.objects.select_for_update(), pk=pk, device=request.user)
        existing = AssessmentPhoto.objects.filter(pk=photo_id).first()
        if existing:
            return Response(status=status.HTTP_200_OK if existing.assessment_id == assessment.id else status.HTTP_404_NOT_FOUND)
        if assessment.is_complete:
            return Response({"detail": "Assessment is already complete."}, status=status.HTTP_409_CONFLICT)
        serializer = PhotoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        position = serializer.validated_data["position"]
        if assessment.photos.filter(position=position).count() >= MAX_PER_POSITION:
            raise ValidationError({"position": f"Maximum {MAX_PER_POSITION} photos per position."})
        serializer.save(id=photo_id, assessment=assessment)
        return Response(status=status.HTTP_201_CREATED)


class CompleteView(APIView):
    @transaction.atomic
    def post(self, request, pk):
        assessment = get_object_or_404(Assessment.objects.select_for_update(), pk=pk, device=request.user)
        counts = list(assessment.photos.values("position").annotate(n=Count("id")))
        errors = []
        if len(counts) < MIN_POSITIONS:
            errors.append("At least one photo is required.")
        for item in counts:
            if not MIN_PER_POSITION <= item["n"] <= MAX_PER_POSITION:
                errors.append(f"Position '{item['position']}' needs {MIN_PER_POSITION}-{MAX_PER_POSITION} photos, has {item['n']}.")
        if errors:
            raise ValidationError({"detail": errors})
        if assessment.is_complete:
            return Response(AssessmentSerializer(assessment).data)
        assessment.is_complete = True
        assessment.save(update_fields=["is_complete"])
        return Response(AssessmentSerializer(assessment).data)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            Device.objects.values_list("id", "recovery_key_hash").first()
            Assessment.objects.values_list("id", "previous_difficult_intubation").first()
            AssessmentPhoto.objects.values_list("id", "position").first()
        except DatabaseError:
            response = Response({"status": "error", "database_ready": False}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        else:
            response = Response({"status": "ok", "database_ready": True})
        response["Cache-Control"] = "no-store"
        return response
