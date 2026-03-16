from django.db import models


class Family(models.Model):
    family_name = models.CharField(max_length=200)
    head_member = models.ForeignKey(
        "Member", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="headed_families"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Families"
        ordering = ["family_name"]

    def __str__(self):
        return self.family_name


class Member(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"), ("active", "Active"), ("inactive", "Inactive")
    ]
    ROLE_CHOICES = [
        ("head", "Head"), ("spouse", "Spouse"), ("child", "Child"),
        ("parent", "Parent"), ("sibling", "Sibling"), ("other", "Other")
    ]
    family = models.ForeignKey(
        Family, on_delete=models.SET_NULL, null=True, blank=True, related_name="members"
    )
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phones = models.CharField(max_length=500, blank=True)  # comma-separated
    dob_month = models.IntegerField(null=True, blank=True)
    dob_day = models.IntegerField(null=True, blank=True)
    anniversary_month = models.IntegerField(null=True, blank=True)
    anniversary_day = models.IntegerField(null=True, blank=True)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)
    profile_photo = models.ImageField(upload_to="profiles/", null=True, blank=True)
    membership_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    family_role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="head")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def is_family_head(self):
        return self.family and self.family.head_member_id == self.pk


class FamilyRelationship(models.Model):
    RELATIONSHIP_CHOICES = [
        ("spouse", "Spouse"), ("child", "Child"), ("parent", "Parent"),
        ("sibling", "Sibling"), ("other", "Other")
    ]
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="relationships")
    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="family_relationships")
    relationship_to_head = models.CharField(max_length=20, choices=RELATIONSHIP_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("family", "member")]

    def __str__(self):
        return f"{self.member} - {self.relationship_to_head}"
