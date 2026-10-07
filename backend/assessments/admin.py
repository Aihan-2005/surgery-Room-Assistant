from django.contrib import admin
from .models import Device, Assessment, AssessmentPhoto

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("doctor_name", "id", "is_active", "created_at")
    list_filter = ("is_active",)

@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ("id", "device", "age", "sex", "is_complete", "created_at", "received_at")
    list_filter = ("is_complete", "device")

admin.site.register(AssessmentPhoto)