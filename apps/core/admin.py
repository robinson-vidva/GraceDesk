from django.contrib import admin
from .models import ChurchSettings, AuditLog


@admin.register(ChurchSettings)
class ChurchSettingsAdmin(admin.ModelAdmin):
    list_display = ["church_name", "church_email", "currency", "timezone", "updated_at"]
    fieldsets = [
        ("Church Info", {"fields": [
            "church_name", "church_logo", "primary_color",
            "church_address", "church_city", "church_state", "church_zip", "church_country",
            "church_phone", "church_email", "church_website", "ein_tax_id",
        ]}),
        ("Localization", {"fields": ["currency", "timezone", "date_format"]}),
        ("Email", {"fields": [
            "brevo_api_key", "default_from_email", "reply_to_email",
            "thankyou_email_subject_template", "thankyou_email_intro_text", "email_image_url",
        ]}),
        ("Security", {"fields": ["turnstile_site_key", "turnstile_secret_key"]}),
    ]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["action", "entity_type", "entity_id", "user", "ip_address", "created_at"]
    list_filter = ["action", "entity_type"]
    readonly_fields = ["user", "action", "entity_type", "entity_id", "details", "ip_address", "user_agent", "created_at"]
    search_fields = ["user__email", "entity_type"]
