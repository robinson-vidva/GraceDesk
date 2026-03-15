from django.db import models


class DonationBatch(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        CLOSED = "closed", "Closed"
        RECONCILED = "reconciled", "Reconciled"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="donation_batches"
    )
    batch_date = models.DateField()
    description = models.CharField(max_length=255, blank=True, default="")
    expected_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.OPEN
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_batches",
    )
    closed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="closed_batches",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "donation_batches"
        verbose_name_plural = "donation batches"
        ordering = ["-batch_date"]

    def __str__(self):
        return f"Batch {self.batch_date} ({self.status})"


class Donation(models.Model):
    class DonationType(models.TextChoices):
        TITHE = "tithe", "Tithe"
        OFFERING = "offering", "Offering"
        BUILDING_FUND = "building_fund", "Building Fund"
        MISSIONS = "missions", "Missions"
        SPECIAL = "special", "Special"
        OTHER = "other", "Other"

    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CHECK = "check", "Check"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        MOBILE = "mobile", "Mobile"
        CREDIT_CARD = "credit_card", "Credit Card"
        ONLINE = "online", "Online"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="donations"
    )
    member = models.ForeignKey(
        "members.Member",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="donations",
    )
    batch = models.ForeignKey(
        DonationBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="donations",
    )
    amount = models.TextField()  # encrypted
    currency = models.CharField(max_length=3, default="USD")
    date = models.DateField()
    type = models.CharField(
        max_length=15, choices=DonationType.choices, default=DonationType.TITHE
    )
    fund_id = models.CharField(max_length=50, blank=True, default="")
    payment_method = models.CharField(
        max_length=15, choices=PaymentMethod.choices, default=PaymentMethod.CASH
    )
    fiscal_year = models.PositiveIntegerField()
    receipt_number = models.CharField(max_length=50, blank=True, default="")
    is_anonymous = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "donations"
        ordering = ["-date"]

    def __str__(self):
        member_name = self.member or "Anonymous"
        return f"Donation by {member_name} on {self.date}"


class Pledge(models.Model):
    class Frequency(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        BIWEEKLY = "biweekly", "Biweekly"
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        ANNUALLY = "annually", "Annually"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="pledges"
    )
    member = models.ForeignKey(
        "members.Member", on_delete=models.CASCADE, related_name="pledges"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    frequency = models.CharField(max_length=10, choices=Frequency.choices)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    fiscal_year = models.PositiveIntegerField()
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "pledges"
        ordering = ["-start_date"]

    def __str__(self):
        return f"Pledge by {self.member} - {self.amount}/{self.frequency}"
