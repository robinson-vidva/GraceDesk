from django.db import models


class ChurchSettings(models.Model):
    church_name = models.CharField(max_length=200, default="My Church")
    church_logo = models.ImageField(upload_to="church/", null=True, blank=True)
    primary_color = models.CharField(max_length=7, default="#3B82F6")  # hex
    church_address = models.CharField(max_length=200, blank=True)
    church_city = models.CharField(max_length=100, blank=True)
    church_state = models.CharField(max_length=100, blank=True)
    church_zip = models.CharField(max_length=20, blank=True)
    church_country = models.CharField(max_length=100, default="USA")
    church_phone = models.CharField(max_length=50, blank=True)
    church_email = models.EmailField(blank=True)
    church_website = models.URLField(blank=True)
    ein_tax_id = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=10, default="USD")
    timezone = models.CharField(max_length=50, default="America/New_York")
    date_format = models.CharField(max_length=20, default="MM/DD/YYYY")
    brevo_api_key = models.CharField(max_length=200, blank=True)  # stored encrypted in prod
    default_from_email = models.EmailField(blank=True)
    reply_to_email = models.EmailField(blank=True)
    thankyou_email_subject_template = models.CharField(
        max_length=200, default="{church_name} — Thank you for your generous contribution"
    )
    thankyou_email_intro_text = models.TextField(
        default="We are grateful for your generous contribution to our church."
    )
    email_image_url = models.URLField(blank=True)
    turnstile_site_key = models.CharField(max_length=100, blank=True)
    turnstile_secret_key = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Church Settings"
        verbose_name_plural = "Church Settings"

    def __str__(self):
        return self.church_name

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ("login", "Login"), ("logout", "Logout"), ("create", "Create"),
        ("update", "Update"), ("delete", "Delete"), ("approve", "Approve"),
        ("reject", "Reject"), ("promote", "Promote"), ("revoke", "Revoke"),
        ("export", "Export"), ("settings_change", "Settings Change"),
    ]
    ENTITY_CHOICES = [
        ("member", "Member"), ("contribution", "Contribution"), ("user", "User"),
        ("family", "Family"), ("settings", "Settings"), ("category", "Category"),
    ]
    user = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    entity_type = models.CharField(max_length=30, choices=ENTITY_CHOICES, blank=True)
    entity_id = models.IntegerField(null=True, blank=True)
    details = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.action} by {self.user} at {self.created_at}"
