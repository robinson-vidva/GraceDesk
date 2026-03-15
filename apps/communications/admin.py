from django.contrib import admin

from apps.core.admin import TenantScopedAdmin
from .models import EmailCampaign, EmailConsent, EmailLog


@admin.register(EmailCampaign)
class EmailCampaignAdmin(TenantScopedAdmin):
    list_display = ("name", "subject", "total_recipients", "delivered", "opened", "bounced", "sent_at", "tenant")
    search_fields = ("name", "subject")
    list_filter = ("sent_at", "tenant")
    raw_id_fields = ("created_by",)


@admin.register(EmailLog)
class EmailLogAdmin(TenantScopedAdmin):
    list_display = ("subject", "recipient_email", "status", "member", "campaign", "sent_at", "tenant")
    search_fields = ("subject", "recipient_email", "brevo_message_id")
    list_filter = ("status", "created_at", "tenant")
    raw_id_fields = ("member", "campaign")


@admin.register(EmailConsent)
class EmailConsentAdmin(TenantScopedAdmin):
    list_display = ("member", "communication_type", "consented", "consent_source", "consented_at", "withdrawn_at", "tenant")
    search_fields = ("member__first_name", "member__last_name", "member__email")
    list_filter = ("communication_type", "consented", "tenant")
    raw_id_fields = ("member",)
