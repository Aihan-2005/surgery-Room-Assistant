from django.contrib import admin, messages
from django.db.models import Count
from django.utils.html import format_html

from .models import Assessment, AssessmentPhoto, Device


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("doctor_name", "short_id", "is_active", "case_count", "created_at")
    list_filter = ("is_active",)
    search_fields = ("doctor_name", "id")
    readonly_fields = ("id", "doctor_name", "token_hash", "created_at")
    actions = ["disable_devices", "enable_devices"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_cases=Count("assessments"))

    @admin.display(description="Device")
    def short_id(self, obj):
        return str(obj.id)[:8]

    @admin.display(description="Cases", ordering="_cases")
    def case_count(self, obj):
        return obj._cases

    def has_add_permission(self, request):
        return False  # devices register themselves through the API

    @admin.action(description="Disable selected devices (block a lost phone)")
    def disable_devices(self, request, queryset):
        n = queryset.update(is_active=False)
        self.message_user(request, f"{n} device(s) disabled.", messages.SUCCESS)

    @admin.action(description="Enable selected devices")
    def enable_devices(self, request, queryset):
        n = queryset.update(is_active=True)
        self.message_user(request, f"{n} device(s) enabled.", messages.SUCCESS)


class PhotoInline(admin.TabularInline):
    model = AssessmentPhoto
    extra = 0
    can_delete = False
    fields = ("preview", "position")
    readonly_fields = ("preview", "position")

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="Photo")
    def preview(self, obj):
        if not obj.image:
            return "-"
        return format_html('<a href="{0}" target="_blank"><img src="{0}" style="height:120px"></a>', obj.image.url)


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ("short_id", "full_name", "device", "age", "sex", "neck_movement",
                    "is_complete", "photos", "created_at", "received_at")
    list_filter = ("is_complete", "neck_movement", "sex", "device")
    search_fields = ("full_name", "id")
    date_hierarchy = "created_at"
    inlines = [PhotoInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_photos=Count("photos"))

    def get_readonly_fields(self, request, obj=None):
        # collected data should not be edited by accident
        return [f.name for f in self.model._meta.fields]

    def has_add_permission(self, request):
        return False

    @admin.display(description="Case")
    def short_id(self, obj):
        return str(obj.id)[:8]

    @admin.display(description="Photos", ordering="_photos")
    def photos(self, obj):
        return obj._photos