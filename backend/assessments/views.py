import secrets

from django.db import DatabaseError
from django.db.models import Count
from django.shortcuts import get_object_or_404

from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import hash_token
from .models import (
    Assessment,
    AssessmentPhoto,
    Device,
)
from .serializers import (
    AssessmentSerializer,
    DeviceRegisterSerializer,
    PhotoSerializer,
)


# ---------------------------------------------------------------------------
# Capture rules
# ---------------------------------------------------------------------------

# حداقل یک پوزیشن باید حداقل یک عکس داشته باشد.
MIN_POSITIONS = 1

# در پوزیشنی که عکس دارد، یک عکس کافی است.
MIN_PER_POSITION = 1

# حداکثر پنج عکس در هر پوزیشن.
MAX_PER_POSITION = 5


# ---------------------------------------------------------------------------
# Device registration
# ---------------------------------------------------------------------------

class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [
        AllowAny
    ]

    throttle_scope = "register"

    def post(
        self,
        request,
    ):
        serializer = DeviceRegisterSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        device_id = (
            serializer
            .validated_data[
                "device_id"
            ]
        )

        if (
            Device.objects
            .filter(
                id=device_id
            )
            .exists()
        ):
            return Response(
                {
                    "detail":
                        "Device already registered."
                },
                status=status.HTTP_409_CONFLICT,
            )

        token = secrets.token_urlsafe(
            32
        )

        Device.objects.create(
            id=device_id,

            doctor_name=(
                serializer
                .validated_data[
                    "doctor_name"
                ]
                .strip()
            ),

            token_hash=hash_token(
                token
            ),
        )

        return Response(
            {
                "token":
                    token
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# Assessment list
# ---------------------------------------------------------------------------

class AssessmentListView(
    generics.ListAPIView
):
    serializer_class = (
        AssessmentSerializer
    )

    def get_queryset(
        self,
    ):
        return (
            Assessment.objects
            .filter(
                device=self.request.user
            )
            .order_by(
                "-created_at"
            )
        )


# ---------------------------------------------------------------------------
# Assessment create/update
# ---------------------------------------------------------------------------

class AssessmentDetailView(
    APIView
):
    """
    PUT = create/update.

    این endpoint idempotent است و retry
    نباید Case جدید ایجاد کند.
    """

    def put(
        self,
        request,
        pk,
    ):
        instance = (
            Assessment.objects
            .filter(
                pk=pk
            )
            .first()
        )

        if (
            instance and
            instance.device_id !=
            request.user.id
        ):
            return Response(
                status=status.HTTP_404_NOT_FOUND
            )

        if (
            instance and
            instance.is_complete
        ):
            return Response(
                AssessmentSerializer(
                    instance
                ).data
            )

        serializer = AssessmentSerializer(
            instance,
            data=request.data,
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save(
            id=pk,
            device=request.user,
        )

        response_status = (
            status.HTTP_200_OK
            if instance
            else status.HTTP_201_CREATED
        )

        return Response(
            serializer.data,
            status=response_status,
        )


# ---------------------------------------------------------------------------
# Photo upload
# ---------------------------------------------------------------------------

class PhotoUploadView(
    APIView
):
    parser_classes = [
        MultiPartParser
    ]

    def put(
        self,
        request,
        pk,
        photo_id,
    ):
        assessment = (
            get_object_or_404(
                Assessment,
                pk=pk,
                device=request.user,
            )
        )

        # Retry همان عکس duplicate ایجاد نکند.
        if (
            AssessmentPhoto.objects
            .filter(
                pk=photo_id,
                assessment=assessment,
            )
            .exists()
        ):
            return Response(
                status=status.HTTP_200_OK
            )

        if (
            assessment.is_complete
        ):
            return Response(
                {
                    "detail":
                        "Assessment is already complete."
                },
                status=status.HTTP_409_CONFLICT,
            )

        serializer = PhotoSerializer(
            data=request.data
        )

        serializer.is_valid(
            raise_exception=True
        )

        position = (
            serializer
            .validated_data[
                "position"
            ]
        )

        current_count = (
            assessment
            .photos
            .filter(
                position=position
            )
            .count()
        )

        if (
            current_count >=
            MAX_PER_POSITION
        ):
            raise ValidationError(
                {
                    "position":
                        (
                            f"Maximum "
                            f"{MAX_PER_POSITION} "
                            "photos per position."
                        )
                }
            )

        serializer.save(
            id=photo_id,
            assessment=assessment,
        )

        return Response(
            status=status.HTTP_201_CREATED
        )


# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------

class CompleteView(
    APIView
):
    def post(
        self,
        request,
        pk,
    ):
        assessment = (
            get_object_or_404(
                Assessment,
                pk=pk,
                device=request.user,
            )
        )

        if (
            assessment.is_complete
        ):
            return Response(
                AssessmentSerializer(
                    assessment
                ).data
            )

        counts = (
            assessment
            .photos
            .values(
                "position"
            )
            .annotate(
                n=Count("id")
            )
        )

        errors = []

        if (
            len(counts) <
            MIN_POSITIONS
        ):
            errors.append(
                "At least one photo is required."
            )

        for item in counts:
            count = item["n"]

            if not (
                MIN_PER_POSITION
                <= count
                <= MAX_PER_POSITION
            ):
                errors.append(
                    (
                        f"Position "
                        f"'{item['position']}' "
                        f"needs "
                        f"{MIN_PER_POSITION}-"
                        f"{MAX_PER_POSITION} "
                        f"photos, has {count}."
                    )
                )

        if errors:
            raise ValidationError(
                {
                    "detail":
                        errors
                }
            )

        assessment.is_complete = True

        assessment.save(
            update_fields=[
                "is_complete"
            ]
        )

        return Response(
            AssessmentSerializer(
                assessment
            ).data
        )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthView(APIView):
    """
    فقط روشن بودن Django کافی نیست.

    این endpoint بررسی می‌کند جدول‌ها و ستون‌های
    مهم دیتابیس واقعاً قابل Query باشند.
    """

    authentication_classes = []

    permission_classes = [
        AllowAny
    ]

    def get(
        self,
        request,
    ):
        try:
            #
            # Device table
            #
            (
                Device.objects
                .values_list(
                    "id",
                    flat=True,
                )
                .first()
            )

            #
            # Assessment table + column migration 0003
            #
            (
                Assessment.objects
                .values_list(
                    "id",
                    "previous_difficult_intubation",
                )
                .first()
            )

            #
            # AssessmentPhoto table + position column
            #
            (
                AssessmentPhoto.objects
                .values_list(
                    "id",
                    "position",
                )
                .first()
            )

        except DatabaseError:
            response = Response(
                {
                    "status":
                        "error",

                    "database_ready":
                        False,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

            response[
                "Cache-Control"
            ] = "no-store"

            return response

        response = Response(
            {
                "status":
                    "ok",

                "database_ready":
                    True,
            }
        )

        response[
            "Cache-Control"
        ] = "no-store"

        return response