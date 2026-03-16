from django.db import models


class ContributionCategory(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "name"]
        verbose_name_plural = "Contribution Categories"

    def __str__(self):
        return self.name


class Contribution(models.Model):
    METHOD_CHOICES = [
        ("cash", "Cash"), ("check", "Check"), ("zelle", "Zelle"),
        ("bank_transfer", "Bank Transfer"), ("zeffy", "Zeffy"),
        ("stripe", "Stripe"), ("paypal", "PayPal"), ("other", "Other")
    ]
    member = models.ForeignKey("members.Member", on_delete=models.PROTECT, related_name="contributions")
    category = models.ForeignKey(ContributionCategory, on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default="USD")
    date = models.DateField()
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    receipt_number = models.CharField(max_length=20, unique=True, blank=True)
    notes = models.TextField(blank=True)
    entered_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, related_name="contributions_entered"
    )
    is_deleted = models.BooleanField(default=False)
    deleted_reason = models.TextField(blank=True)
    deleted_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="contributions_deleted"
    )
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.receipt_number} - {self.member} - {self.amount}"

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            self.receipt_number = self._generate_receipt_number()
        super().save(*args, **kwargs)

    def _generate_receipt_number(self):
        from django.utils import timezone
        year = self.date.year if self.date else timezone.now().year
        last = Contribution.objects.filter(
            receipt_number__startswith=f"{year}-"
        ).order_by("-receipt_number").first()
        if last:
            try:
                n = int(last.receipt_number.split("-")[1]) + 1
            except (IndexError, ValueError):
                n = 1
        else:
            n = 1
        return f"{year}-{n:03d}"


class ReportCache(models.Model):
    REPORT_TYPE_CHOICES = [("monthly", "Monthly"), ("annual", "Annual")]
    member = models.ForeignKey("members.Member", on_delete=models.CASCADE)
    report_type = models.CharField(max_length=10, choices=REPORT_TYPE_CHOICES)
    period_year = models.IntegerField()
    period_month = models.IntegerField(null=True, blank=True)
    file_path = models.CharField(max_length=500)
    generated_at = models.DateTimeField(auto_now_add=True)
    is_valid = models.BooleanField(default=True)

    class Meta:
        unique_together = [("member", "report_type", "period_year", "period_month")]
