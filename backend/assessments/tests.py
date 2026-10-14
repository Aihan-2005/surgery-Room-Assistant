"""
Django tests for the assessments API.

Put this file in the app folder as  assessments/tests.py  and run:
    python manage.py test assessments

No running server is needed: Django creates a temporary test database,
and uploaded photos go to a temporary folder that is deleted afterwards.
Assumes the project urls.py contains:  path("api/", include("assessments.urls"))
"""
import datetime
import io
import json
import random
import shutil
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from unittest.mock import patch
from zipfile import ZipFile

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError, close_old_connections
from django.test import override_settings
from django.urls import reverse
from PIL import Image, ImageCms
from rest_framework.test import APIClient, APITestCase, APITransactionTestCase

from .authentication import hash_recovery_key, hash_token
from .models import Assessment, AssessmentPhoto, Device

API = "/api"
TEMP_MEDIA = tempfile.mkdtemp()
ALL_POSITIONS = ("front", "mallampati", "open_mouth", "side", "upper_lip_bite", "head_back_side")


def tearDownModule():
    shutil.rmtree(TEMP_MEDIA, ignore_errors=True)


def jpeg_file(name="p.jpg"):
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), "red").save(buf, "JPEG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class BaseAPITest(APITestCase):
    def setUp(self):
        cache.clear()  # reset the registration rate limit between tests

    # ---- helpers -------------------------------------------------------
    def register(self, name="Dr. Test"):
        device_id = str(uuid.uuid4())
        response = self.client.post(
            f"{API}/devices/register/",
            {"device_id": device_id, "doctor_name": name},
            format="json",
        )
        return device_id, response

    def make_client(self, name="Dr. Test"):
        """A client that is registered and sends its device token."""
        device_id, response = self.register(name)
        self.assertEqual(response.status_code, 201, response.data)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Device {response.data['token']}")
        client.device_id = device_id
        client.device_token = response.data["token"]
        client.recovery_key = response.data["recovery_key"]
        return client

    @staticmethod
    def case_data(**overrides):
        data = {
            "full_name": "Test Patient",
            "age": 40,
            "sex": "M",
            "height_cm": "175.0",
            "weight_kg": "80.0",
            "neck_movement": "normal",
            "previous_difficult_intubation": "no",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        data.update(overrides)
        return data

    def put_case(self, client, case_id=None, **overrides):
        case_id = case_id or str(uuid.uuid4())
        response = client.put(f"{API}/assessments/{case_id}/", self.case_data(**overrides), format="json")
        return case_id, response

    def upload(self, client, case_id, position, photo_id=None):
        photo_id = photo_id or str(uuid.uuid4())
        response = client.put(
            f"{API}/assessments/{case_id}/photos/{photo_id}/",
            {"position": position, "image": jpeg_file()},
            format="multipart",
        )
        return photo_id, response

    def complete(self, client, case_id):
        return client.post(f"{API}/assessments/{case_id}/complete/")

    def upload_many(self, client, case_id, position, count):
        for _ in range(count):
            _, response = self.upload(client, case_id, position)
            self.assertEqual(response.status_code, 201, response.data)


class RegistrationTests(BaseAPITest):
    def test_register_returns_token(self):
        device_id, response = self.register("Dr. Ahmed")
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.data)
        device = Device.objects.get(id=device_id)
        self.assertEqual(device.doctor_name, "Dr. Ahmed")
        self.assertNotEqual(device.token_hash, response.data["token"])  # only the hash is stored

    def test_registering_same_device_twice_returns_409(self):
        device_id, _ = self.register()
        response = self.client.post(
            f"{API}/devices/register/", {"device_id": device_id, "doctor_name": "X"}, format="json"
        )
        self.assertEqual(response.status_code, 409)

    def test_register_requires_both_fields(self):
        response = self.client.post(f"{API}/devices/register/", {"doctor_name": "X"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(f"{API}/devices/register/", {"device_id": str(uuid.uuid4())}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_registration_is_rate_limited(self):
        limit = int(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["register"].split("/")[0])
        codes = [self.register()[1].status_code for _ in range(limit + 1)]
        self.assertEqual(codes[:limit], [201] * limit)
        self.assertEqual(codes[limit], 429)

    def test_request_without_token_is_401(self):
        self.assertEqual(self.client.get(f"{API}/assessments/").status_code, 401)

    def test_request_with_wrong_token_is_401(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Device not-a-real-token")
        self.assertEqual(client.get(f"{API}/assessments/").status_code, 401)

    def test_disabled_device_is_403_to_prevent_automatic_reregistration(self):
        client = self.make_client()
        Device.objects.filter(id=client.device_id).update(is_active=False)
        self.assertEqual(client.get(f"{API}/assessments/").status_code, 403)


class AssessmentTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.doctor = self.make_client()

    def test_create_then_retry_does_not_duplicate(self):
        case_id, response = self.put_case(self.doctor)
        self.assertEqual(response.status_code, 201)
        _, response = self.put_case(self.doctor, case_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Assessment.objects.filter(id=case_id).count(), 1)

    def test_case_is_linked_to_the_calling_device(self):
        case_id, _ = self.put_case(self.doctor)
        self.assertEqual(str(Assessment.objects.get(id=case_id).device_id), self.doctor.device_id)

    def test_full_name_is_required(self):
        data = self.case_data()
        del data["full_name"]
        response = self.doctor.put(f"{API}/assessments/{uuid.uuid4()}/", data, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("full_name", response.data)

    def test_blank_full_name_is_rejected(self):
        _, response = self.put_case(self.doctor, full_name="")
        self.assertEqual(response.status_code, 400)

    def test_neck_movement_accepts_only_normal_or_limited(self):
        for value in ("normal", "limited"):
            _, response = self.put_case(self.doctor, neck_movement=value)
            self.assertEqual(response.status_code, 201, value)
        _, response = self.put_case(self.doctor, neck_movement="bent")
        self.assertEqual(response.status_code, 400)

    def test_previous_difficult_intubation_accepts_yes_no_unknown(self):
        for value in ("yes", "no", "unknown"):
            _, response = self.put_case(self.doctor, previous_difficult_intubation=value)
            self.assertEqual(response.status_code, 201, value)
        _, response = self.put_case(self.doctor, previous_difficult_intubation="maybe")
        self.assertEqual(response.status_code, 400)

    def test_previous_difficult_intubation_is_required(self):
        data = self.case_data()
        del data["previous_difficult_intubation"]
        response = self.doctor.put(f"{API}/assessments/{uuid.uuid4()}/", data, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("previous_difficult_intubation", response.data)

    def test_sex_must_be_m_or_f(self):
        _, response = self.put_case(self.doctor, sex="X")
        self.assertEqual(response.status_code, 400)

    def test_age_out_of_range_is_rejected(self):
        _, response = self.put_case(self.doctor, age=200)
        self.assertEqual(response.status_code, 400)

    def test_other_device_cannot_overwrite_a_case(self):
        case_id, _ = self.put_case(self.doctor)
        other = self.make_client("Dr. Other")
        _, response = self.put_case(other, case_id, full_name="Hacked")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Assessment.objects.get(id=case_id).full_name, "Test Patient")


class PhotoTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.doctor = self.make_client()
        self.case_id, _ = self.put_case(self.doctor)

    def test_upload_then_retry_does_not_duplicate(self):
        photo_id, response = self.upload(self.doctor, self.case_id, "front")
        self.assertEqual(response.status_code, 201)
        _, response = self.upload(self.doctor, self.case_id, "front", photo_id=photo_id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AssessmentPhoto.objects.filter(assessment_id=self.case_id).count(), 1)

    def test_all_positions_are_accepted(self):
        for position in ALL_POSITIONS:
            _, response = self.upload(self.doctor, self.case_id, position)
            self.assertEqual(response.status_code, 201, position)

    def test_invalid_position_is_rejected(self):
        _, response = self.upload(self.doctor, self.case_id, "foot")
        self.assertEqual(response.status_code, 400)

    def test_non_image_file_is_rejected(self):
        response = self.doctor.put(
            f"{API}/assessments/{self.case_id}/photos/{uuid.uuid4()}/",
            {"position": "front", "image": SimpleUploadedFile("a.jpg", b"not an image", content_type="image/jpeg")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    def test_oversized_image_is_rejected(self):
        with patch("assessments.serializers.MAX_IMAGE_BYTES", 10):
            _, response = self.upload(self.doctor, self.case_id, "front")
        self.assertEqual(response.status_code, 400)

    def test_max_five_photos_per_position(self):
        self.upload_many(self.doctor, self.case_id, "front", 5)
        _, response = self.upload(self.doctor, self.case_id, "front")
        self.assertEqual(response.status_code, 400)
        _, response = self.upload(self.doctor, self.case_id, "side")  # other positions are unaffected
        self.assertEqual(response.status_code, 201)

    def test_cannot_upload_to_another_devices_case(self):
        other = self.make_client("Dr. Other")
        _, response = self.upload(other, self.case_id, "front")
        self.assertEqual(response.status_code, 404)

    def test_cannot_upload_to_unknown_case(self):
        _, response = self.upload(self.doctor, str(uuid.uuid4()), "front")
        self.assertEqual(response.status_code, 404)

    def test_cannot_upload_after_completion(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 2)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)
        _, response = self.upload(self.doctor, self.case_id, "front")
        self.assertEqual(response.status_code, 409)


class CompleteTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.doctor = self.make_client()
        self.case_id, _ = self.put_case(self.doctor)

    def test_a_case_with_no_photos_cannot_be_completed(self):
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Assessment.objects.get(id=self.case_id).is_complete)
        self.assertEqual(AssessmentPhoto.objects.filter(assessment_id=self.case_id).count(), 0)

    def test_legacy_complete_case_without_photos_is_still_rejected(self):
        Assessment.objects.filter(id=self.case_id).update(is_complete=True)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 400)

    def test_one_position_is_enough(self):
        self.upload_many(self.doctor, self.case_id, "front", 3)
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Assessment.objects.get(id=self.case_id).is_complete)

    def test_a_position_with_a_single_photo_is_accepted(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 1)
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Assessment.objects.get(id=self.case_id).is_complete)

    def test_one_photo_in_each_of_two_positions_succeeds(self):
        self.upload_many(self.doctor, self.case_id, "front", 1)
        self.upload_many(self.doctor, self.case_id, "side", 1)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)

    def test_a_single_photo_in_a_single_position_is_enough(self):
        self.upload_many(self.doctor, self.case_id, "side", 1)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)

    def test_two_positions_with_two_photos_each_succeeds(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 2)
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_complete"])
        self.assertTrue(Assessment.objects.get(id=self.case_id).is_complete)

    def test_five_photos_in_every_position_succeeds(self):
        for position in ALL_POSITIONS:
            self.upload_many(self.doctor, self.case_id, position, 5)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)

    def test_completing_twice_is_safe(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 2)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 200)

    def test_update_after_completion_changes_nothing(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 2)
        self.complete(self.doctor, self.case_id)
        _, response = self.put_case(self.doctor, self.case_id, full_name="Changed")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Assessment.objects.get(id=self.case_id).full_name, "Test Patient")

    def test_other_device_cannot_complete(self):
        other = self.make_client("Dr. Other")
        self.assertEqual(self.complete(other, self.case_id).status_code, 404)


class ListTests(BaseAPITest):
    def test_device_sees_only_its_own_cases(self):
        a, b = self.make_client("Dr. A"), self.make_client("Dr. B")
        case_a1, _ = self.put_case(a)
        case_a2, _ = self.put_case(a)
        case_b, _ = self.put_case(b)

        ids_a = {item["id"] for item in a.get(f"{API}/assessments/").data}
        ids_b = {item["id"] for item in b.get(f"{API}/assessments/").data}
        self.assertEqual(ids_a, {case_a1, case_a2})
        self.assertEqual(ids_b, {case_b})

    def test_new_device_has_an_empty_list(self):
        response = self.make_client().get(f"{API}/assessments/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_list_shows_completion_state_and_photo_count(self):
        doctor = self.make_client()
        done, _ = self.put_case(doctor)
        open_case, _ = self.put_case(doctor)
        self.upload_many(doctor, done, "front", 2)
        self.upload_many(doctor, done, "side", 2)
        self.complete(doctor, done)

        by_id = {item["id"]: item for item in doctor.get(f"{API}/assessments/").data}
        self.assertTrue(by_id[done]["is_complete"])
        self.assertEqual(by_id[done]["photo_count"], 4)
        self.assertFalse(by_id[open_case]["is_complete"])
        self.assertEqual(by_id[open_case]["photo_count"], 0)

    def test_list_is_newest_first(self):
        doctor = self.make_client()
        old, _ = self.put_case(doctor, created_at="2026-01-01T10:00:00Z")
        new, _ = self.put_case(doctor, created_at="2026-06-01T10:00:00Z")
        ids = [item["id"] for item in doctor.get(f"{API}/assessments/").data]
        self.assertEqual(ids, [new, old])


class HealthTests(BaseAPITest):
    def test_health_is_public_and_never_cached(self):
        response = self.client.get(f"{API}/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok", "database_ready": True})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_database_failure_is_reported_as_unavailable(self):
        with patch("assessments.views.Device.objects.values_list", side_effect=DatabaseError):
            response = self.client.get(f"{API}/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data, {"status": "error", "database_ready": False})
        self.assertEqual(response["Cache-Control"], "no-store")


class RecoveryTests(BaseAPITest):
    def recover(self, client, key=None):
        return APIClient().post(f"{API}/devices/recover/", {
            "device_id": client.device_id,
            "recovery_key": client.recovery_key if key is None else key,
        }, format="json")

    def test_recovery_resumes_partial_upload_and_preserves_history(self):
        doctor = self.make_client()
        case_id, _ = self.put_case(doctor)
        first_id, _ = self.upload(doctor, case_id, "front")
        response = self.recover(doctor)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["device_id"], doctor.device_id)
        self.assertNotEqual(response.data["token"], doctor.device_token)
        self.assertEqual(doctor.get(f"{API}/assessments/").status_code, 401)
        doctor.credentials(HTTP_AUTHORIZATION=f"Device {response.data['token']}")
        self.assertEqual(self.put_case(doctor, case_id)[1].status_code, 200)
        self.assertEqual(self.upload(doctor, case_id, "front", photo_id=first_id)[1].status_code, 200)
        self.assertEqual(self.upload(doctor, case_id, "side")[1].status_code, 201)
        self.assertEqual(self.complete(doctor, case_id).status_code, 200)
        self.assertEqual(AssessmentPhoto.objects.filter(assessment_id=case_id).count(), 2)
        self.assertEqual(Device.objects.count(), 1)
        self.assertEqual(doctor.get(f"{API}/assessments/").data[0]["id"], case_id)

    def test_wrong_recovery_key_does_not_change_token(self):
        doctor = self.make_client()
        self.assertEqual(self.recover(doctor, "incorrect").status_code, 401)
        self.assertEqual(doctor.get(f"{API}/assessments/").status_code, 200)

    def test_disabled_device_cannot_recover(self):
        doctor = self.make_client()
        Device.objects.filter(id=doctor.device_id).update(is_active=False)
        self.assertEqual(self.recover(doctor).status_code, 401)
        self.assertFalse(Device.objects.get(id=doctor.device_id).is_active)

    def test_recovery_key_is_hashed_and_cannot_be_used_as_device_token(self):
        doctor = self.make_client()
        device = Device.objects.get(id=doctor.device_id)
        self.assertEqual(device.recovery_key_hash, hash_recovery_key(doctor.recovery_key))
        self.assertNotEqual(device.recovery_key_hash, doctor.recovery_key)
        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f"Device {doctor.recovery_key}")
        self.assertEqual(other.get(f"{API}/assessments/").status_code, 401)

    def test_existing_device_can_provision_recovery_without_changing_id(self):
        doctor = self.make_client()
        Device.objects.filter(id=doctor.device_id).update(recovery_key_hash="")
        self.assertEqual(self.recover(doctor).status_code, 401)
        response = doctor.post(f"{API}/devices/recovery-key/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["device_id"], doctor.device_id)
        self.assertEqual(self.recover(doctor, response.data["recovery_key"]).status_code, 200)

    def test_disabled_device_cannot_provision_a_new_key(self):
        doctor = self.make_client()
        Device.objects.filter(id=doctor.device_id).update(is_active=False)
        self.assertEqual(doctor.post(f"{API}/devices/recovery-key/", {}, format="json").status_code, 403)

    def test_recovery_can_be_retried_after_response_is_lost(self):
        doctor = self.make_client()
        self.assertEqual(self.recover(doctor).status_code, 200)
        second = self.recover(doctor)
        self.assertEqual(second.status_code, 200)
        doctor.credentials(HTTP_AUTHORIZATION=f"Device {second.data['token']}")
        self.assertEqual(doctor.get(f"{API}/assessments/").status_code, 200)

    def test_same_doctor_name_does_not_grant_access_to_another_device(self):
        first = self.make_client("Dr. Same")
        case_id, _ = self.put_case(first)
        second = self.make_client("Dr. Same")
        self.assertEqual(second.get(f"{API}/assessments/").data, [])
        self.assertEqual(self.put_case(second, case_id)[1].status_code, 404)

    def test_recovery_is_rate_limited(self):
        doctor = self.make_client()
        limit = int(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["recover"].split("/")[0])
        codes = [self.recover(doctor, "incorrect").status_code for _ in range(limit + 1)]
        self.assertEqual(codes[:limit], [401] * limit)
        self.assertEqual(codes[limit], 429)


class ImageProcessingTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        self.doctor = self.make_client()
        self.case_id, _ = self.put_case(self.doctor)

    def upload_image(self, image, image_format="PNG", **save_options):
        buffer = io.BytesIO()
        image.save(buffer, image_format, **save_options)
        photo_id = str(uuid.uuid4())
        response = self.doctor.put(f"{API}/assessments/{self.case_id}/photos/{photo_id}/", {
            "position": "head_back_side",
            "image": SimpleUploadedFile("misleading.jpg", buffer.getvalue(), content_type="image/jpeg"),
        }, format="multipart")
        return photo_id, response, buffer.getvalue()

    def stored_image(self, photo_id):
        photo = AssessmentPhoto.objects.get(id=photo_id)
        with photo.image.open("rb") as source:
            raw = source.read()
        return photo, Image.open(io.BytesIO(raw)), raw

    def test_png_is_converted_to_jpeg_without_resizing(self):
        photo_id, response, _ = self.upload_image(Image.new("RGB", (120, 80), "red"))
        self.assertEqual(response.status_code, 201)
        photo, image, _ = self.stored_image(photo_id)
        self.assertEqual(image.format, "JPEG")
        self.assertEqual(image.size, (120, 80))
        self.assertEqual(photo.image.name, f"assessments/{self.case_id}/head_back_side_{photo_id}.jpg")

    def test_noisy_photo_is_compressed(self):
        pixels = random.Random(42).randbytes(256 * 256 * 3)
        photo_id, response, original = self.upload_image(Image.frombytes("RGB", (256, 256), pixels))
        self.assertEqual(response.status_code, 201)
        _, image, encoded = self.stored_image(photo_id)
        self.assertLess(len(encoded), len(original))
        self.assertEqual(image.size, (256, 256))

    def test_exif_orientation_is_applied_and_metadata_removed(self):
        exif = Image.Exif()
        exif[274] = 6
        exif[270] = "Private embedded note"
        photo_id, response, _ = self.upload_image(Image.new("RGB", (120, 80), "blue"), "JPEG", exif=exif)
        self.assertEqual(response.status_code, 201)
        _, image, _ = self.stored_image(photo_id)
        self.assertEqual(image.size, (80, 120))
        self.assertNotIn(274, image.getexif())
        self.assertNotIn(270, image.getexif())

    def test_transparency_is_flattened_on_white(self):
        photo_id, response, _ = self.upload_image(Image.new("RGBA", (50, 50), (255, 0, 0, 0)))
        self.assertEqual(response.status_code, 201)
        _, image, _ = self.stored_image(photo_id)
        self.assertEqual(image.mode, "RGB")
        self.assertTrue(all(channel >= 250 for channel in image.getpixel((25, 25))))

    def test_rgb_colour_profile_is_preserved(self):
        profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        photo_id, response, _ = self.upload_image(Image.new("RGB", (50, 50), "red"), icc_profile=profile)
        self.assertEqual(response.status_code, 201)
        _, image, _ = self.stored_image(photo_id)
        self.assertEqual(image.info.get("icc_profile"), profile)

    @override_settings(PHOTO_MAX_PIXELS=100)
    def test_pixel_limit_prevents_storage(self):
        _, response, _ = self.upload_image(Image.new("RGB", (50, 50), "red"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(AssessmentPhoto.objects.count(), 0)

    def test_animated_image_is_rejected(self):
        _, response, _ = self.upload_image(
            Image.new("RGB", (50, 50), "red"), "WEBP",
            save_all=True, append_images=[Image.new("RGB", (50, 50), "blue")], duration=100,
        )
        self.assertEqual(response.status_code, 400)

    def test_photo_uuid_cannot_overwrite_another_case(self):
        photo_id, _ = self.upload(self.doctor, self.case_id, "front")
        other_case, _ = self.put_case(self.doctor)
        _, response = self.upload(self.doctor, other_case, "side", photo_id=photo_id)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(str(AssessmentPhoto.objects.get(id=photo_id).assessment_id), self.case_id)

    def test_photo_download_requires_owner_and_media_is_not_public(self):
        photo_id, _ = self.upload(self.doctor, self.case_id, "front")
        url = f"{API}/assessments/{self.case_id}/photos/{photo_id}/"
        self.assertEqual(APIClient().get(url).status_code, 401)
        self.assertEqual(self.make_client("Dr. Other").get(url).status_code, 404)
        response = self.doctor.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        # Fully consuming the test client's stream also closes the file safely.
        b"".join(response.streaming_content)
        photo = AssessmentPhoto.objects.get(id=photo_id)
        self.assertEqual(APIClient().get(photo.image.url).status_code, 404)


class ExportTests(BaseAPITest):
    def download(self, doctor):
        response = doctor.get(f"{API}/assessments/export/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        data = b"".join(response.streaming_content)
        return ZipFile(io.BytesIO(data))

    def test_readable_fields_numbered_photos_and_owner_scope(self):
        doctor = self.make_client()
        case_id, _ = self.put_case(doctor, full_name="Ali Reza", created_at="2026-10-13T12:30:00Z")
        self.upload_many(doctor, case_id, "front", 2)
        other = self.make_client("Dr. Other")
        hidden_id, _ = self.put_case(other)
        self.upload(other, hidden_id, "side")
        with self.download(doctor) as archive:
            self.assertIsNone(archive.testzip())
            label = "Ali-Reza-20261013T123000000000Z"
            prefix = f"{label}/{label}"
            self.assertIn(f"{prefix}-Photo-front-01.jpg", archive.namelist())
            self.assertIn(f"{prefix}-Photo-front-02.jpg", archive.namelist())
            fields = json.loads(archive.read(f"{prefix}-Fields.json"))
            self.assertEqual(fields[f"{label}-Sex"], "M")
            record = json.loads(archive.read(f"{prefix}-Case.json"))
            self.assertEqual(record["id"], case_id)
            self.assertEqual(record["full_name"], "Ali Reza")
            self.assertEqual(len(record["photos"]), 2)
            self.assertNotIn("token_hash", record)
            self.assertNotIn("recovery_key_hash", record)
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual([item["id"] for item in manifest["cases"]], [case_id])
            with Image.open(io.BytesIO(archive.read(f"{prefix}-Photo-front-01.jpg"))) as image:
                self.assertEqual(image.format, "JPEG")

    def test_same_patient_and_timestamp_do_not_collide(self):
        doctor = self.make_client()
        for _ in range(2):
            self.put_case(doctor, full_name="Same Patient", created_at="2026-10-13T12:30:00Z")
        with self.download(doctor) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            folders = [case["folder"] for case in manifest["cases"]]
            self.assertEqual(len(set(folders)), 2)
            self.assertTrue(folders[1].endswith("-02"))
            self.assertEqual(len(archive.namelist()), len(set(archive.namelist())))

    def test_unicode_and_unsafe_names_extract_to_portable_paths(self):
        doctor = self.make_client()
        case_id, _ = self.put_case(doctor, full_name="../../" + "علی " * 45)
        self.upload(doctor, case_id, "upper_lip_bite")
        with self.download(doctor) as archive:
            for name in archive.namelist():
                self.assertFalse(name.startswith("/"))
                self.assertNotIn("..", name.split("/"))
                for part in name.split("/"):
                    self.assertLessEqual(len(part.encode("utf-8")), 255)
            with tempfile.TemporaryDirectory() as destination:
                archive.extractall(destination)

    def test_export_without_authentication_is_rejected(self):
        self.assertEqual(APIClient().get(f"{API}/assessments/export/").status_code, 401)

    def test_missing_media_does_not_produce_incomplete_archive(self):
        doctor = self.make_client()
        case_id, _ = self.put_case(doctor)
        self.upload(doctor, case_id, "front")
        with patch("django.core.files.storage.FileSystemStorage.open", side_effect=FileNotFoundError):
            response = doctor.get(f"{API}/assessments/export/")
        self.assertEqual(response.status_code, 400)

    def test_legacy_png_under_jpg_name_is_converted_only_in_export(self):
        doctor = self.make_client()
        case_id, _ = self.put_case(doctor)
        case = Assessment.objects.get(id=case_id)
        buf = io.BytesIO()
        Image.new("RGB", (50, 50), "blue").save(buf, "PNG")
        photo = AssessmentPhoto.objects.create(
            assessment=case, position="side",
            image=SimpleUploadedFile("old.jpg", buf.getvalue(), content_type="image/png"),
        )
        with self.download(doctor) as archive:
            name = next(name for name in archive.namelist() if name.endswith(".jpg"))
            with Image.open(io.BytesIO(archive.read(name))) as image:
                self.assertEqual(image.format, "JPEG")
        with photo.image.open("rb") as source, Image.open(source) as original:
            self.assertEqual(original.format, "PNG")


class AdminDownloadTests(BaseAPITest):
    def setUp(self):
        super().setUp()
        doctor = self.make_client()
        self.case_id, _ = self.put_case(doctor)
        self.photo_id, _ = self.upload(doctor, self.case_id, "front")

    def login_staff(self, superuser=False):
        user = get_user_model().objects.create_user(
            username=f"staff-{uuid.uuid4()}", is_staff=True, is_superuser=superuser,
        )
        self.client.force_login(user)

    def test_admin_preview_requires_view_permission(self):
        url = reverse("admin:assessments_photo", args=[self.photo_id])
        self.assertEqual(self.client.get(url).status_code, 302)
        self.login_staff()
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_authorized_admin_can_preview_private_photo(self):
        self.login_staff(superuser=True)
        response = self.client.get(reverse("admin:assessments_photo", args=[self.photo_id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/jpeg")
        self.assertTrue(b"".join(response.streaming_content).startswith(b"\xff\xd8"))

    def test_full_backup_requires_superuser_and_post(self):
        url = reverse("admin:assessments_full_backup")
        self.assertEqual(self.client.post(url).status_code, 302)
        self.login_staff()
        self.assertEqual(self.client.post(url).status_code, 403)

    def test_superuser_downloads_readable_full_backup_and_can_restore_media(self):
        self.login_staff(superuser=True)
        self.assertEqual(self.client.get(reverse("admin:assessments_full_backup")).status_code, 405)
        changelist = self.client.get(reverse("admin:assessments_assessment_changelist"))
        self.assertContains(changelist, "Download full database + photos ZIP")
        self.assertNotContains(changelist, "Download selected cases as a readable ZIP")
        with patch("assessments.backups._dump_database") as dump:
            def fake_dump(destination):
                destination.write_bytes(b"database-dump")
                return "postgresql", "database.dump"
            dump.side_effect = fake_dump
            response = self.client.post(reverse("admin:assessments_full_backup"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("airway-full-backup-", response["Content-Disposition"])
        backup_bytes = b"".join(response.streaming_content)
        with ZipFile(io.BytesIO(backup_bytes)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.read("database.dump"), b"database-dump")
            photo = AssessmentPhoto.objects.get(id=self.photo_id)
            manifest = json.loads(archive.read("backup.json"))
            self.assertEqual([item["id"] for item in manifest["cases"]], [self.case_id])
            photo_mapping = next(item for item in manifest["media_files"]
                                 if item["storage_path"] == photo.image.name)
            original_photo = photo.image.read()
            self.assertIn("Test-Patient-", photo_mapping["archive_path"])
            self.assertIn("-Photo-front-01.jpg", photo_mapping["archive_path"])
            self.assertEqual(archive.read(photo_mapping["archive_path"]), original_photo)
            self.assertTrue(any(name.endswith("-Fields.json") for name in archive.namelist()))
            self.assertEqual(manifest["database_engine"], "postgresql")
            self.assertEqual(manifest["media_file_count"],
                             len(manifest["media_files"]))
        with tempfile.TemporaryDirectory() as restored_media:
            with tempfile.NamedTemporaryFile(suffix=".zip") as backup_file:
                backup_file.write(backup_bytes)
                backup_file.flush()
                with override_settings(MEDIA_ROOT=restored_media):
                    call_command("restore_media_from_backup", backup_file.name, stdout=io.StringIO())
                    self.assertEqual((Path(restored_media) / photo.image.name).read_bytes(), original_photo)
                    with self.assertRaises(CommandError):
                        call_command("restore_media_from_backup", backup_file.name, stdout=io.StringIO())

    def test_full_backup_cancels_if_database_photo_is_missing(self):
        self.login_staff(superuser=True)
        photo = AssessmentPhoto.objects.get(id=self.photo_id)
        photo.image.delete(save=False)
        with patch("assessments.backups._dump_database") as dump:
            def fake_dump(destination):
                destination.write_bytes(b"dump")
                return "postgresql", "database.dump"
            dump.side_effect = fake_dump
            response = self.client.post(reverse("admin:assessments_full_backup"))
        self.assertEqual(response.status_code, 302)


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class ConcurrentUploadTests(APITransactionTestCase):
    def setUp(self):
        cache.clear()
        self.device = Device.objects.create(
            id=uuid.uuid4(), doctor_name="Dr. Concurrent", token_hash=hash_token("concurrent-token"),
        )
        self.case = Assessment.objects.create(device=self.device, **{
            **BaseAPITest.case_data(), "created_at": datetime.datetime.now(datetime.timezone.utc),
        })

    def client_for_thread(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Device concurrent-token")
        return client

    def upload_for_thread(self, barrier=None):
        close_old_connections()
        try:
            if barrier:
                barrier.wait(timeout=10)
            response = self.client_for_thread().put(
                f"{API}/assessments/{self.case.id}/photos/{uuid.uuid4()}/",
                {"position": "front", "image": jpeg_file()}, format="multipart",
            )
            return response.status_code
        finally:
            close_old_connections()

    def test_concurrent_uploads_cannot_exceed_five_per_position(self):
        for _ in range(4):
            self.assertEqual(self.upload_for_thread(), 201)
        barrier = Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.upload_for_thread, barrier) for _ in range(2)]
            codes = sorted(future.result(timeout=20) for future in futures)
        self.assertEqual(codes, [201, 400])
        self.assertEqual(self.case.photos.count(), 5)

    def test_completion_and_first_upload_cannot_finalize_an_empty_case(self):
        barrier = Barrier(2)

        def complete():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return self.client_for_thread().post(f"{API}/assessments/{self.case.id}/complete/").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            upload = pool.submit(self.upload_for_thread, barrier)
            completion = pool.submit(complete)
            self.assertEqual(upload.result(timeout=20), 201)
            completion_status = completion.result(timeout=20)
        self.case.refresh_from_db()
        self.assertEqual(self.case.photos.count(), 1)
        self.assertEqual(self.case.is_complete, completion_status == 200)
        self.assertIn(completion_status, [200, 400])
