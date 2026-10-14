import uuid

from django.db import (
    migrations,
    models,
)

import django.db.models.deletion


class Migration(
    migrations.Migration
):
    dependencies = [
        (
            "assessments",
            "0004_device_recovery_key_hash_alter_assessmentphoto_image",
        ),
    ]

    operations = [
        migrations.CreateModel(
            name=
                "PushSubscription",

            fields=[
                (
                    "id",
                    models.UUIDField(
                        primary_key=True,
                        default=
                            uuid.uuid4,
                        editable=False,
                        serialize=False,
                    ),
                ),

                (
                    "endpoint",
                    models.URLField(
                        max_length=2048,
                        unique=True,
                    ),
                ),

                (
                    "p256dh",
                    models.CharField(
                        max_length=512,
                    ),
                ),

                (
                    "auth",
                    models.CharField(
                        max_length=255,
                    ),
                ),

                (
                    "expiration_time_ms",
                    models.BigIntegerField(
                        null=True,
                        blank=True,
                    ),
                ),

                (
                    "user_agent",
                    models.CharField(
                        max_length=512,
                        blank=True,
                        default="",
                    ),
                ),

                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                    ),
                ),

                (
                    "failure_count",
                    models.PositiveSmallIntegerField(
                        default=0,
                    ),
                ),

                (
                    "last_success_at",
                    models.DateTimeField(
                        null=True,
                        blank=True,
                    ),
                ),

                (
                    "last_failure_at",
                    models.DateTimeField(
                        null=True,
                        blank=True,
                    ),
                ),

                (
                    "created_at",
                    models.DateTimeField(
                        auto_now_add=True,
                    ),
                ),

                (
                    "updated_at",
                    models.DateTimeField(
                        auto_now=True,
                    ),
                ),

                (
                    "device",
                    models.ForeignKey(
                        on_delete=
                            django.db.models
                            .deletion
                            .CASCADE,

                        related_name=
                            "push_subscriptions",

                        to=
                            "assessments.device",
                    ),
                ),
            ],

            options={
                "ordering": [
                    "-updated_at"
                ],

                "indexes": [
                    models.Index(
                        fields=[
                            "device",
                            "is_active",
                        ],
                        name=
                            "push_device_active_idx",
                    ),
                ],
            },
        ),
    ]