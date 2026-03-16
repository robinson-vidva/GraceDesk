from django.db import models


class BibleVerse(models.Model):
    reference = models.CharField(max_length=100)  # e.g. "2 Corinthians 9:7"
    text = models.TextField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.reference


class EmailLog(models.Model):
    EMAIL_TYPE_CHOICES = [
        ("thank_you", "Thank You"), ("welcome", "Welcome"),
        ("password_reset", "Password Reset"), ("invite", "Invite"), ("report", "Report")
    ]
    STATUS_CHOICES = [
        ("queued", "Queued"), ("sent", "Sent"), ("delivered", "Delivered"),
        ("opened", "Opened"), ("bounced", "Bounced"), ("failed", "Failed")
    ]
    member = models.ForeignKey("members.Member", on_delete=models.SET_NULL, null=True)
    contribution = models.ForeignKey(
        "contributions.Contribution", on_delete=models.SET_NULL, null=True, blank=True
    )
    email_type = models.CharField(max_length=20, choices=EMAIL_TYPE_CHOICES)
    subject = models.CharField(max_length=500)
    recipient_email = models.EmailField()
    brevo_message_id = models.CharField(max_length=200, blank=True)
    bible_verse_used = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    error_message = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.email_type} to {self.recipient_email}"
