import uuid

from django.core.validators import (
    MaxValueValidator,
    MinValueValidator,
)
from django.db import models

from .naming import make_case_label


class Device(models.Model):
    """
    One phone/browser installation.

    The frontend generates the UUID once and keeps it stable.
    """

    id = models.UUIDField(
        primary_key=True
    )

    doctor_name = models.CharField(
        max_length=100
    )

    token_hash = models.CharField(
        max_length=64,
        unique=True,
    )

    recovery_key_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        editable=False,
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return (
            f"{self.doctor_name} "
            f"({str(self.id)[:8]})"
        )


class Position(models.TextChoices):
    FRONT = (
        "front",
        "Front view",
    )

    MALLAMPATI = (
        "mallampati",
        "Mallampati view",
    )

    OPEN_MOUTH = (
        "open_mouth",
        "Open mouth view",
    )

    SIDE = (
        "side",
        "Side view",
    )

    UPPER_LIP_BITE = (
        "upper_lip_bite",
        "Upper lip bite view",
    )

    HEAD_BACK_SIDE = (
        "head_back_side",
        "Head back side view",
    )


class NeckMovement(models.TextChoices):
    NORMAL = (
        "normal",
        "Normal",
    )

    LIMITED = (
        "limited",
        "Limited",
    )


class DifficultIntubation(
    models.TextChoices
):
    YES = (
        "yes",
        "Yes",
    )

    NO = (
        "no",
        "No",
    )

    UNKNOWN = (
        "unknown",
        "Don't know",
    )


class Assessment(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    device = models.ForeignKey(
        Device,
        on_delete=models.PROTECT,
        related_name="assessments",
    )

    full_name = models.CharField(
        max_length=200
    )

    age = models.PositiveSmallIntegerField(
        validators=[
            MaxValueValidator(120)
        ]
    )

    sex = models.CharField(
        max_length=1,
        choices=[
            (
                "M",
                "Male",
            ),
            (
                "F",
                "Female",
            ),
        ],
    )

    height_cm = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        validators=[
            MinValueValidator(30)
        ],
    )

    weight_kg = models.DecimalField(
        max_digits=5,
        decimal_places=1,
        validators=[
            MinValueValidator(1)
        ],
    )

    neck_movement = models.CharField(
        max_length=10,
        choices=NeckMovement.choices,
    )

    previous_difficult_intubation = (
        models.CharField(
            max_length=10,
            choices=DifficultIntubation.choices,
        )
    )

    is_complete = models.BooleanField(
        default=False
    )

    created_at = models.DateTimeField()

    received_at = models.DateTimeField(
        auto_now_add=True
    )

    @property
    def case_label(self):
        return make_case_label(
            self.full_name,
            self.created_at,
        )

    def __str__(self):
        return self.case_label


def photo_path(
    instance,
    filename,
):
    return (
        f"assessments/"
        f"{instance.assessment_id}/"
        f"{instance.position}_"
        f"{instance.id}.jpg"
    )


class AssessmentPhoto(models.Model):
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    assessment = models.ForeignKey(
        Assessment,
        on_delete=models.CASCADE,
        related_name="photos",
    )

    position = models.CharField(
        max_length=20,
        choices=Position.choices,
    )

    image = models.ImageField(
        upload_to=photo_path,
        max_length=512,
    )


class PushSubscription(models.Model):
    """
    Browser Web Push subscription belonging to one Device.

    endpoint/p256dh/auth are not patient data, but they are still
    sensitive delivery credentials and must not be exposed publicly.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )

    endpoint = models.URLField(
        max_length=2048,
        unique=True,
    )

    p256dh = models.CharField(
        max_length=512
    )

    auth = models.CharField(
        max_length=255
    )

    expiration_time_ms = (
        models.BigIntegerField(
            null=True,
            blank=True,
        )
    )

    user_agent = models.CharField(
        max_length=512,
        blank=True,
        default="",
    )

    is_active = models.BooleanField(
        default=True
    )

    failure_count = (
        models.PositiveSmallIntegerField(
            default=0
        )
    )

    last_success_at = (
        models.DateTimeField(
            null=True,
            blank=True,
        )
    )

    last_failure_at = (
        models.DateTimeField(
            null=True,
            blank=True,
        )
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = [
            "-updated_at"
        ]

        indexes = [
            models.Index(
                fields=[
                    "device",
                    "is_active",
                ],
                name="push_device_active_idx",
            ),
        ]

    def __str__(self):
        state = (
            "active"
            if self.is_active
            else "inactive"
        )

        return (
            f"{self.device} - "
            f"{state}"
        )