import secrets
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import hash_token
from .models import Assessment, AssessmentPhoto, Device
from .serializers import AssessmentSerializer, DeviceRegisterSerializer, PhotoSerializer

MIN_POSITIONS = 2          # at least 2 positions photographed
MIN_PER_POSITION = 2       # each photographed position needs >= 2 photos
MAX_PER_POSITION = 5       # ... and <= 5


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "register"  # rate limit, see settings

    def post(self, request):
        s = DeviceRegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        device_id = s.validated_data["device_id"]
        if Device.objects.filter(id=device_id).exists():
            # token can't be re-issued; the app should generate a new UUID and register again
            return Response({"detail": "Device already registered."}, status=status.HTTP_409_CONFLICT)
        token = secrets.token_urlsafe(32)
        Device.objects.create(
            id=device_id,
            doctor_name=s.validated_data["doctor_name"].strip(),
            token_hash=hash_token(token),
        )
        return Response({"token": token}, status=status.HTTP_201_CREATED)


class AssessmentListView(generics.ListAPIView):
    serializer_class = AssessmentSerializer

    def get_queryset(self):
        # a device only ever sees its own cases
        return Assessment.objects.filter(device=self.request.user).order_by("-created_at")


class AssessmentDetailView(APIView):
    """PUT = create-or-update, safe to retry."""

    def put(self, request, pk):
        instance = Assessment.objects.filter(pk=pk).first()
        if instance and instance.device_id != request.user.id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if instance and instance.is_complete:
            return Response(AssessmentSerializer(instance).data)  # already finished, nothing to do
        s = AssessmentSerializer(instance, data=request.data)
        s.is_valid(raise_exception=True)
        s.save(id=pk, device=request.user)
        code = status.HTTP_200_OK if instance else status.HTTP_201_CREATED
        return Response(s.data, status=code)


class PhotoUploadView(APIView):
    """PUT multipart {position, image}. The photo id comes from the URL, so retries don't duplicate."""
    parser_classes = [MultiPartParser]

    def put(self, request, pk, photo_id):
        assessment = get_object_or_404(Assessment, pk=pk, device=request.user)

        if AssessmentPhoto.objects.filter(pk=photo_id, assessment=assessment).exists():
            return Response(status=status.HTTP_200_OK)  # already uploaded
        if assessment.is_complete:
            return Response({"detail": "Assessment is already complete."}, status=status.HTTP_409_CONFLICT)

        s = PhotoSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        position = s.validated_data["position"]
        if assessment.photos.filter(position=position).count() >= MAX_PER_POSITION:
            raise ValidationError({"position": f"Maximum {MAX_PER_POSITION} photos per position."})
        s.save(id=photo_id, assessment=assessment)
        return Response(status=status.HTTP_201_CREATED)


class CompleteView(APIView):
    def post(self, request, pk):
        assessment = get_object_or_404(Assessment, pk=pk, device=request.user)
        if assessment.is_complete:
            return Response(AssessmentSerializer(assessment).data)

        counts = assessment.photos.values("position").annotate(n=Count("id"))
        errors = []
        if len(counts) < MIN_POSITIONS:
            errors.append(f"At least {MIN_POSITIONS} positions are required.")
        for c in counts:
            if not MIN_PER_POSITION <= c["n"] <= MAX_PER_POSITION:
                errors.append(f"Position '{c['position']}' needs {MIN_PER_POSITION}-{MAX_PER_POSITION} photos, has {c['n']}.")
        if errors:
            raise ValidationError({"detail": errors})

        assessment.is_complete = True
        assessment.save(update_fields=["is_complete"])
        return Response(AssessmentSerializer(assessment).data)