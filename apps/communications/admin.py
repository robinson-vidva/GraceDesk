from django.contrib import admin

from .models import EmailCampaign, EmailConsent, EmailLog


@admin.register(EmailCampaign)
class EmailCampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "total_recipients", "delivered", "opened", "bounced", "sent_at", "tenant")
    search_fields = ("name", "subject")
    list_filter = ("tenant", "sent_at")
    raw_id_fields = ("created_by",)


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ("subject", "recipient_email", "status", "member", "campaign", "sent_at", "tenant")
    search_fields = ("subject", "recipient_email", "brevo_message_id")
    list_filter = ("status", "tenant", "created_at")
    raw_id_fields = ("member", "campaign")


@admin.register(EmailConsent)
class EmailConsentAdmin(admin.ModelAdmin):
    list_display = ("member", "communication_type", "consented", "consent_source", "consented_at", "withdrawn_at", "tenant")
    search_fields = ("member__first_name", "member__last_name", "member__email")
    list_filter = ("communication_type", "consented", "tenant")
    raw_id_fields = ("member",)
