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
import shutil
import tempfile
import uuid
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APIClient, APITestCase

from .models import Assessment, AssessmentPhoto, Device

API = "/api"
TEMP_MEDIA = tempfile.mkdtemp()


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
        codes = [self.register()[1].status_code for _ in range(11)]
        self.assertEqual(codes[:10], [201] * 10)
        self.assertEqual(codes[10], 429)

    def test_request_without_token_is_401(self):
        self.assertEqual(self.client.get(f"{API}/assessments/").status_code, 401)

    def test_request_with_wrong_token_is_401(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Device not-a-real-token")
        self.assertEqual(client.get(f"{API}/assessments/").status_code, 401)

    def test_disabled_device_is_401(self):
        client = self.make_client()
        Device.objects.filter(id=client.device_id).update(is_active=False)
        self.assertEqual(client.get(f"{API}/assessments/").status_code, 401)


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

    def test_all_four_positions_are_accepted(self):
        for position in ("front", "mallampati", "open_mouth", "side"):
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

    def test_no_photos_is_rejected(self):
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 400)

    def test_one_position_is_not_enough(self):
        self.upload_many(self.doctor, self.case_id, "front", 3)
        self.assertEqual(self.complete(self.doctor, self.case_id).status_code, 400)

    def test_a_position_with_a_single_photo_is_rejected(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 1)
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Assessment.objects.get(id=self.case_id).is_complete)

    def test_two_positions_with_two_photos_each_succeeds(self):
        self.upload_many(self.doctor, self.case_id, "front", 2)
        self.upload_many(self.doctor, self.case_id, "side", 2)
        response = self.complete(self.doctor, self.case_id)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_complete"])
        self.assertTrue(Assessment.objects.get(id=self.case_id).is_complete)

    def test_five_photos_in_every_position_succeeds(self):
        for position in ("front", "mallampati", "open_mouth", "side"):
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