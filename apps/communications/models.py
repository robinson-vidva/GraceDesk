from django.db import models


class EmailCampaign(models.Model):
    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="email_campaigns"
    )
    name = models.CharField(max_length=255)
    subject = models.CharField(max_length=255)
    template_id = models.CharField(max_length=100, blank=True, default="")
    target_segment = models.CharField(max_length=255, blank=True, default="")
    total_recipients = models.PositiveIntegerField(default=0)
    delivered = models.PositiveIntegerField(default=0)
    opened = models.PositiveIntegerField(default=0)
    clicked = models.PositiveIntegerField(default=0)
    bounced = models.PositiveIntegerField(default=0)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="email_campaigns",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_campaigns"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class EmailLog(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        DELIVERED = "delivered", "Delivered"
        OPENED = "opened", "Opened"
        CLICKED = "clicked", "Clicked"
        BOUNCED = "bounced", "Bounced"
        FAILED = "failed", "Failed"
        UNSUBSCRIBED = "unsubscribed", "Unsubscribed"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="email_logs"
    )
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        related_name="email_logs",
    )
    campaign = models.ForeignKey(
        EmailCampaign,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="email_logs",
    )
    brevo_message_id = models.CharField(max_length=255, blank=True, default="")
    template_name = models.CharField(max_length=255, blank=True, default="")
    subject = models.CharField(max_length=255)
    recipient_email = models.EmailField()
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.QUEUED
    )
    bounce_type = models.CharField(max_length=50, blank=True, default="")
    bounce_reason = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "email_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.subject} -> {self.recipient_email} ({self.status})"


class EmailConsent(models.Model):
    class CommunicationType(models.TextChoices):
        NEWSLETTER = "newsletter", "Newsletter"
        DONATION_RECEIPT = "donation_receipt", "Donation Receipt"
        EVENT = "event", "Event"
        PASTORAL = "pastoral", "Pastoral"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="email_consents"
    )
    member = models.ForeignKey(
        "members.Member", on_delete=models.CASCADE, related_name="email_consents"
    )
    communication_type = models.CharField(
        max_length=20, choices=CommunicationType.choices
    )
    consented = models.BooleanField(default=False)
    consent_source = models.CharField(max_length=100, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    consented_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "email_consent"
        unique_together = ["tenant", "member", "communication_type"]

    def __str__(self):
        status = "consented" if self.consented else "withdrawn"
        return f"{self.member} - {self.communication_type} ({status})"
