from django.db import models


class Household(models.Model):
    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="households"
    )
    family_name = models.CharField(max_length=255)
    address_line1 = models.CharField(max_length=255, blank=True, default="")
    address_line2 = models.CharField(max_length=255, blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    state = models.CharField(max_length=100, blank=True, default="")
    postal_code = models.CharField(max_length=20, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="US")
    home_phone = models.CharField(max_length=20, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "households"
        verbose_name_plural = "households"

    def __str__(self):
        return self.family_name


class Member(models.Model):
    class MembershipStatus(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        VISITOR = "visitor", "Visitor"
        PENDING = "pending", "Pending"
        TRANSFERRED = "transferred", "Transferred"
        DECEASED = "deceased", "Deceased"

    class HouseholdRole(models.TextChoices):
        HEAD = "head", "Head"
        SPOUSE = "spouse", "Spouse"
        CHILD = "child", "Child"
        OTHER = "other", "Other"

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    class MaritalStatus(models.TextChoices):
        SINGLE = "single", "Single"
        MARRIED = "married", "Married"
        DIVORCED = "divorced", "Divorced"
        WIDOWED = "widowed", "Widowed"
        SEPARATED = "separated", "Separated"

    tenant = models.ForeignKey(
        "core.Tenant", on_delete=models.CASCADE, related_name="members"
    )
    household = models.ForeignKey(
        Household,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    date_of_birth = models.TextField(blank=True, default="")  # encrypted
    gender = models.CharField(
        max_length=10, choices=Gender.choices, blank=True, default=""
    )
    marital_status = models.CharField(
        max_length=10, choices=MaritalStatus.choices, blank=True, default=""
    )
    profile_photo = models.ImageField(
        upload_to="members/photos/", blank=True, null=True
    )
    membership_date = models.DateField(null=True, blank=True)
    membership_status = models.CharField(
        max_length=15,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
    )
    household_role = models.CharField(
        max_length=10, choices=HouseholdRole.choices, blank=True, default=""
    )
    pastoral_notes = models.TextField(blank=True, default="")  # encrypted
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)  # soft delete

    class Meta:
        db_table = "members"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    @property
    def is_deleted(self):
        return self.deleted_at is not None
