from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model. Argon2id password hashing configured in settings."""

    tenant = models.ForeignKey(
        "core.Tenant",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="users",
    )
    phone = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.get_full_name() or self.username
