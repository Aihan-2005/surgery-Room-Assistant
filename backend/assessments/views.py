import secrets

from django.conf import settings
from django.db import (
    DatabaseError,
    IntegrityError,
    transaction,
)
from django.db.models import Count
from django.http import FileResponse
from django.shortcuts import (
    get_object_or_404,
)
from django.utils import timezone

from PIL import (
    Image,
    UnidentifiedImageError,
)

from rest_framework import (
    generics,
    status,
)
from rest_framework.exceptions import (
    ValidationError,
)
from rest_framework.parsers import (
    MultiPartParser,
)
from rest_framework.permissions import (
    AllowAny,
)
from rest_framework.response import (
    Response,
)
from rest_framework.views import (
    APIView,
)

from .authentication import (
    hash_recovery_key,
    hash_token,
)

from .exports import (
    export_assessments,
)

from .models import (
    Assessment,
    AssessmentPhoto,
    Device,
    PushSubscription,
)

from .push import (
    PushConfigurationError,
    push_is_configured,
    send_sync_reminder_to_device,
)

from .serializers import (
    AssessmentSerializer,
    DeviceRecoverSerializer,
    DeviceRegisterSerializer,
    PhotoSerializer,
    PushSubscriptionSerializer,
    PushUnsubscribeSerializer,
)


MIN_POSITIONS = 1

MIN_PER_POSITION = 1

MAX_PER_POSITION = 5


# ---------------------------------------------------------------------------
# Device registration / recovery
# ---------------------------------------------------------------------------

class RegisterView(
    APIView
):
    authentication_classes = []

    permission_classes = [
        AllowAny
    ]

    throttle_scope = (
        "register"
    )

    def post(
        self,
        request,
    ):
        serializer = (
            DeviceRegisterSerializer(
                data=request.data
            )
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

        token = (
            secrets.token_urlsafe(
                32
            )
        )

        recovery_key = (
            secrets.token_urlsafe(
                32
            )
        )

        try:
            with transaction.atomic():
                Device.objects.create(
                    id=device_id,

                    doctor_name=(
                        serializer
                        .validated_data[
                            "doctor_name"
                        ]
                        .strip()
                    ),

                    token_hash=
                        hash_token(
                            token
                        ),

                    recovery_key_hash=
                        hash_recovery_key(
                            recovery_key
                        ),
                )

        except IntegrityError:
            if not Device.objects.filter(
                id=device_id
            ).exists():
                raise

            return Response(
                {
                    "code":
                        "DEVICE_ALREADY_REGISTERED",

                    "detail":
                        (
                            "Device already registered. "
                            "Recover the same device with "
                            "its recovery key."
                        ),
                },
                status=
                    status.HTTP_409_CONFLICT,
            )

        response = Response(
            {
                "device_id":
                    str(
                        device_id
                    ),

                "token":
                    token,

                "recovery_key":
                    recovery_key,
            },
            status=
                status.HTTP_201_CREATED,
        )

        response[
            "Cache-Control"
        ] = "no-store"

        return response


class DeviceRecoveryKeyView(
    APIView
):
    throttle_scope = (
        "recover"
    )

    def post(
        self,
        request,
    ):
        key = (
            secrets.token_urlsafe(
                32
            )
        )

        with transaction.atomic():
            device = (
                get_object_or_404(
                    Device.objects
                    .select_for_update(),
                    pk=request.user.id,
                    is_active=True,
                )
            )

            device.recovery_key_hash = (
                hash_recovery_key(
                    key
                )
            )

            device.save(
                update_fields=[
                    "recovery_key_hash"
                ]
            )

        response = Response(
            {
                "device_id":
                    str(
                        device.id
                    ),

                "recovery_key":
                    key,
            }
        )

        response[
            "Cache-Control"
        ] = "no-store"

        return response


class DeviceRecoverView(
    APIView
):
    authentication_classes = []

    permission_classes = [
        AllowAny
    ]

    throttle_scope = (
        "recover"
    )

    def post(
        self,
        request,
    ):
        serializer = (
            DeviceRecoverSerializer(
                data=request.data
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        with transaction.atomic():
            device = (
                Device.objects
                .select_for_update()
                .filter(
                    pk=(
                        serializer
                        .validated_data[
                            "device_id"
                        ]
                    ),

                    is_active=True,
                )
                .first()
            )

            expected = (
                hash_recovery_key(
                    serializer
                    .validated_data[
                        "recovery_key"
                    ]
                )
            )

            if (
                not device or
                not device
                .recovery_key_hash or
                not secrets
                .compare_digest(
                    device
                    .recovery_key_hash,

                    expected,
                )
            ):
                return Response(
                    {
                        "code":
                            "DEVICE_RECOVERY_FAILED",

                        "detail":
                            (
                                "Invalid recovery credentials "
                                "or disabled device."
                            ),
                    },
                    status=
                        status.HTTP_401_UNAUTHORIZED,
                )

            token = (
                secrets.token_urlsafe(
                    32
                )
            )

            device.token_hash = (
                hash_token(
                    token
                )
            )

            device.save(
                update_fields=[
                    "token_hash"
                ]
            )

        response = Response(
            {
                "device_id":
                    str(
                        device.id
                    ),

                "token":
                    token,
            }
        )

        response[
            "Cache-Control"
        ] = "no-store"

        return response


# ---------------------------------------------------------------------------
# Web Push
# ---------------------------------------------------------------------------

class PushConfigView(
    APIView
):
    authentication_classes = []

    permission_classes = [
        AllowAny
    ]

    def get(
        self,
        request,
    ):
        enabled = (
            push_is_configured()
        )

        response = Response(
            {
                "enabled":
                    enabled,

                "public_key":
                    (
                        settings
                        .WEB_PUSH_VAPID_PUBLIC_KEY
                        if enabled
                        else None
                    ),
            }
        )

        response[
            "Cache-Control"
        ] = "no-store"

        return response


class PushSubscriptionView(
    APIView
):
    throttle_scope = (
        "push"
    )

    @transaction.atomic
    def post(
        self,
        request,
    ):
        serializer = (
            PushSubscriptionSerializer(
                data=request.data
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        endpoint = (
            serializer
            .validated_data[
                "endpoint"
            ]
        )

        keys = (
            serializer
            .validated_data[
                "keys"
            ]
        )

        expiration_time = (
            serializer
            .validated_data
            .get(
                "expirationTime"
            )
        )

        existing = (
            PushSubscription.objects
            .select_for_update()
            .filter(
                endpoint=endpoint
            )
            .first()
        )

        if (
            existing and
            existing.device_id !=
            request.user.id
        ):
            return Response(
                {
                    "code":
                        "PUSH_ENDPOINT_CONFLICT",

                    "detail":
                        (
                            "This push endpoint belongs "
                            "to another device."
                        ),
                },
                status=
                    status.HTTP_409_CONFLICT,
            )

        now = timezone.now()

        if existing:
            subscription = existing

            subscription.p256dh = (
                keys[
                    "p256dh"
                ]
            )

            subscription.auth = (
                keys[
                    "auth"
                ]
            )

            subscription.expiration_time_ms = (
                expiration_time
            )

            subscription.user_agent = (
                request.META.get(
                    "HTTP_USER_AGENT",
                    "",
                )[:512]
            )

            subscription.is_active = (
                True
            )

            subscription.failure_count = (
                0
            )

            subscription.last_failure_at = (
                None
            )

            subscription.save(
                update_fields=[
                    "p256dh",
                    "auth",
                    "expiration_time_ms",
                    "user_agent",
                    "is_active",
                    "failure_count",
                    "last_failure_at",
                    "updated_at",
                ]
            )

            created = False

        else:
            subscription = (
                PushSubscription
                .objects
                .create(
                    device=
                        request.user,

                    endpoint=
                        endpoint,

                    p256dh=
                        keys[
                            "p256dh"
                        ],

                    auth=
                        keys[
                            "auth"
                        ],

                    expiration_time_ms=
                        expiration_time,

                    user_agent=
                        request
                        .META
                        .get(
                            "HTTP_USER_AGENT",
                            "",
                        )[:512],
                )
            )

            created = True

        
         # One Device represents one browser/app installation.
         #If its endpoint rotated, old subscriptions should
         # not generate duplicate notifications.
         
        (
 PushSubscription
            .objects
            .filter(
                device=
                    request.user,

                is_active=True,
            )
            .exclude(
                pk=
                    subscription.pk
            )
            .update(
                is_active=False,

                updated_at=now,
            )
        )

        return Response(
            {
                "id":
                    str(
                        subscription.id
                    ),

                "active":
                    True,

                "created":
                    created,
            },
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            ),
        )

    def delete(
        self,
        request,
    ):
        serializer = (
            PushUnsubscribeSerializer(
                data=request.data
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        endpoint = (
            serializer
            .validated_data[
                "endpoint"
            ]
        )

        (
            PushSubscription
            .objects
            .filter(
                device=
                    request.user,

                endpoint=
                    endpoint,
            )
            .delete()
        )

        return Response(
            status=
                status.HTTP_204_NO_CONTENT
        )


class PushTestView(
    APIView
):
    throttle_scope = (
        "push_test"
    )

    def post(
        self,
        request,
    ):
        if not push_is_configured():
            return Response(
                {
                    "code":
                        "WEB_PUSH_NOT_CONFIGURED",

                    "detail":
                        (
                            "Web Push has not been "
                            "configured on the server."
                        ),
                },
                status=
                    status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            result = (
                send_sync_reminder_to_device(
                    request.user,
                    test=True,
                )
            )

        except PushConfigurationError:
            return Response(
                {
                    "code":
                        "WEB_PUSH_NOT_CONFIGURED",

                    "detail":
                        (
                            "Web Push has not been "
                            "configured on the server."
                        ),
                },
                status=
                    status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if (
            result[
                "active_subscriptions"
            ] == 0
        ):
            return Response(
                {
                    "code":
                        "NO_ACTIVE_PUSH_SUBSCRIPTION",

                    "detail":
                        (
                            "No active push subscription "
                            "exists for this device."
                        ),
                },
                status=
                    status.HTTP_409_CONFLICT,
            )

        if result["sent"] == 0:
            result["detail"] = {
                "PUSH_SERVICE_UNREACHABLE": "The server cannot reach the browser push service. Check outbound HTTPS connectivity.",
                "PUSH_SERVICE_TIMEOUT": "The browser push service did not respond before the timeout.",
                "PUSH_SUBSCRIPTION_EXPIRED": "The push subscription expired. Enable notifications again.",
                "PUSH_SERVICE_REJECTED": "The browser push service rejected the request. Check server push configuration.",
            }.get(result.get("code"), "The server could not send the test notification.")
            return Response(result, status=status.HTTP_502_BAD_GATEWAY)

        return Response(result)


# ---------------------------------------------------------------------------
# Assessments
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
                device=
                    self.request.user
            )
            .order_by(
                "-created_at"
            )
        )


class AssessmentExportView(
    APIView
):
    def get(
        self,
        request,
    ):
        archive = (
            export_assessments(
                Assessment.objects
                .filter(
                    device=
                        request.user
                )
            )
        )

        response = FileResponse(
            archive,
            as_attachment=True,
            filename=
                "airway-cases.zip",
            content_type=
                "application/zip",
        )

        response[
            "Cache-Control"
        ] = "private, no-store"

        return response


class AssessmentDetailView(
    APIView
):
    def get(self, request, pk):
        assessment = get_object_or_404(
            Assessment, pk=pk, device=request.user,
        )
        payload = dict(AssessmentSerializer(assessment).data)
        # Photo bytes remain behind the existing owner-authenticated endpoint.
        # Storage URLs cannot carry the device authorization header.
        payload["photos"] = [
            {"id": str(photo.id), "position": photo.position}
            for photo in assessment.photos.order_by("position", "id")
        ]
        response = Response(payload)
        response["Cache-Control"] = "private, no-store"
        return response

    @transaction.atomic
    def put(
        self,
        request,
        pk,
    ):
        get_object_or_404(
            Device.objects
            .select_for_update(),
            pk=request.user.id,
            is_active=True,
        )

        instance = (
            Assessment.objects
            .select_for_update()
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
                status=
                    status.HTTP_404_NOT_FOUND
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

        serializer = (
            AssessmentSerializer(
                instance,
                data=request.data,
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save(
            id=pk,
            device=request.user,
        )

        return Response(
            serializer.data,
            status=(
                status.HTTP_200_OK
                if instance
                else
                status.HTTP_201_CREATED
            ),
        )


class PhotoUploadView(
    APIView
):
    parser_classes = [
        MultiPartParser
    ]

    def get(
        self,
        request,
        pk,
        photo_id,
    ):
        photo = (
            get_object_or_404(
                AssessmentPhoto,
                pk=photo_id,
                assessment_id=pk,
                assessment__device=
                    request.user,
            )
        )

        try:
            source = (
                photo.image.open(
                    "rb"
                )
            )

            with Image.open(
                source
            ) as image:
                content_type = (
                    Image.MIME.get(
                        image.format,
                        "application/octet-stream",
                    )
                )

            source.seek(
                0
            )

        except (
            OSError,
            UnidentifiedImageError,
        ) as exc:
            photo.image.close()

            raise ValidationError(
                (
                    "The photo file is unavailable. "
                    "Restore it from the media backup."
                )
            ) from exc

        response = FileResponse(
            source,
            content_type=
                content_type,
        )

        response[
            "Cache-Control"
        ] = "private, no-store"

        return response

    @transaction.atomic
    def put(
        self,
        request,
        pk,
        photo_id,
    ):
        assessment = (
            get_object_or_404(
                Assessment.objects
                .select_for_update(),
                pk=pk,
                device=request.user,
            )
        )

        existing = (
            AssessmentPhoto.objects
            .filter(
                pk=photo_id
            )
            .first()
        )

        if existing:
            return Response(
                status=(
                    status.HTTP_200_OK
                    if (
                        existing
                        .assessment_id ==
                        assessment.id
                    )
                    else
                    status.HTTP_404_NOT_FOUND
                )
            )

        if (
            assessment.is_complete
        ):
            return Response(
                {
                    "detail":
                        (
                            "Assessment is already "
                            "complete."
                        )
                },
                status=
                    status.HTTP_409_CONFLICT,
            )

        serializer = (
            PhotoSerializer(
                data=request.data
            )
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

        if (
            assessment
            .photos
            .filter(
                position=position
            )
            .count()
            >=
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
            status=
                status.HTTP_201_CREATED
        )


class CompleteView(
    APIView
):
    @transaction.atomic
    def post(
        self,
        request,
        pk,
    ):
        assessment = (
            get_object_or_404(
                Assessment.objects
                .select_for_update(),
                pk=pk,
                device=request.user,
            )
        )

        counts = list(
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
            len(
                counts
            ) <
            MIN_POSITIONS
        ):
            errors.append(
                "At least one photo is required."
            )

        for item in counts:
            if not (
                MIN_PER_POSITION
                <=
                item["n"]
                <=
                MAX_PER_POSITION
            ):
                errors.append(
                    (
                        f"Position "
                        f"'{item['position']}' "
                        f"needs "
                        f"{MIN_PER_POSITION}-"
                        f"{MAX_PER_POSITION} "
                        f"photos, has "
                        f"{item['n']}."
                    )
                )

        if errors:
            raise ValidationError(
                {
                    "detail":
                        errors
                }
            )

        if (
            assessment.is_complete
        ):
            return Response(
                AssessmentSerializer(
                    assessment
                ).data
            )

        assessment.is_complete = (
            True
        )

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

class HealthView(
    APIView
):
    authentication_classes = []

    permission_classes = [
        AllowAny
    ]

    def get(
        self,
        request,
    ):
        try:
            (
                Device.objects
                .values_list(
                    "id",
                    "recovery_key_hash",
                )
                .first()
            )

            (
                Assessment.objects
                .values_list(
                    "id",
                    "previous_difficult_intubation",
                )
                .first()
            )

            (
                AssessmentPhoto.objects
                .values_list(
                    "id",
                    "position",
                )
                .first()
            )

            (
                PushSubscription.objects
                .values_list(
                    "id",
                    "is_active",
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
                status=
                    status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        else:
            response = Response(
                {
                    "status":
                        "ok",

                    "database_ready":
                        True,

                    "web_push_ready":
                        push_is_configured(),
                }
            )

        response[
            "Cache-Control"
        ] = "no-store"

        return response
