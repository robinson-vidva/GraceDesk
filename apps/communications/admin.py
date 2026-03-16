from django.contrib import admin
from .models import BibleVerse, EmailLog


@admin.register(BibleVerse)
class BibleVerseAdmin(admin.ModelAdmin):
    list_display = ["reference", "is_active", "created_at"]
    list_filter = ["is_active"]
    search_fields = ["reference", "text"]


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ["email_type", "recipient_email", "status", "sent_at", "created_at"]
    list_filter = ["email_type", "status"]
    search_fields = ["recipient_email", "subject"]
    readonly_fields = ["member", "contribution", "email_type", "subject", "recipient_email",
                       "brevo_message_id", "bible_verse_used", "status", "error_message",
                       "sent_at", "created_at"]
