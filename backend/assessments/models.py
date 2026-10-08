import uuid
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class Device(models.Model):
    """One phone/browser install. Identified by a UUID generated on the device."""
    id = models.UUIDField(primary_key=True)  # sent by the app at registration
    doctor_name = models.CharField(max_length=100)
    token_hash = models.CharField(max_length=64, unique=True)  # sha256 of the issued token
    is_active = models.BooleanField(default=True)  # untick in admin to block a phone
    created_at = models.DateTimeField(auto_now_add=True)

    # lets DRF treat a Device as an authenticated "user"
    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return f"{self.doctor_name} ({str(self.id)[:8]})"


class Position(models.TextChoices):
    # To add a position later: add a line here, run makemigrations/migrate,
    # and add the same code to the frontend POSITIONS constant.
    FRONT = "front", "Front view"
    MALLAMPATI = "mallampati", "Mallampati view"
    OPEN_MOUTH = "open_mouth", "Open mouth view"
    SIDE = "side", "Side view"
    UPPER_LIP_BITE = "upper_lip_bite", "Upper lip bite view"
    HEAD_BACK_SIDE = "head_back_side", "Head back side view"


class NeckMovement(models.TextChoices):
    NORMAL = "normal", "Normal"
    LIMITED = "limited", "Limited"


class DifficultIntubation(models.TextChoices):
    YES = "yes", "Yes"
    NO = "no", "No"
    UNKNOWN = "unknown", "Don't know"


class Assessment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # set by the app
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="assessments")
    full_name = models.CharField(max_length=200)  # required
    age = models.PositiveSmallIntegerField(validators=[MaxValueValidator(120)])
    sex = models.CharField(max_length=1, choices=[("M", "Male"), ("F", "Female")])
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, validators=[MinValueValidator(30)])
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, validators=[MinValueValidator(1)])
    neck_movement = models.CharField(max_length=10, choices=NeckMovement.choices)
    previous_difficult_intubation = models.CharField(max_length=10, choices=DifficultIntubation.choices)
    is_complete = models.BooleanField(default=False)
    created_at = models.DateTimeField()  # time on the phone when the case was saved
    received_at = models.DateTimeField(auto_now_add=True)


def photo_path(instance, filename):
    return f"assessments/{instance.assessment_id}/{instance.position}_{instance.id}.jpg"


class AssessmentPhoto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)  # set by the app
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="photos")
    position = models.CharField(max_length=20, choices=Position.choices)
    image = models.ImageField(upload_to=photo_path)