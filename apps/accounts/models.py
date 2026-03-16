from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_admin", True)
        extra_fields.setdefault("can_manage_admins", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    is_admin = models.BooleanField(default=False)
    can_manage_admins = models.BooleanField(default=False)
    is_active = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)  # for Django admin
    must_change_password = models.BooleanField(default=False)
    member = models.OneToOneField(
        "members.Member", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="user"
    )
    failed_login_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip() or self.email

    def is_locked(self):
        if self.locked_until and self.locked_until > timezone.now():
            return True
        return False

    def get_lockout_duration(self):
        """Return lockout duration in minutes based on failed attempts."""
        attempts = self.failed_login_attempts
        if attempts >= 8:
            return 24 * 60  # 24 hours
        elif attempts >= 6:
            return 60  # 1 hour
        elif attempts >= 5:
            return 30  # 30 min
        return 15  # 15 min

    def record_failed_login(self):
        from datetime import timedelta
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            minutes = self.get_lockout_duration()
            self.locked_until = timezone.now() + timedelta(minutes=minutes)
        self.save(update_fields=["failed_login_attempts", "locked_until"])

    def record_successful_login(self):
        self.failed_login_attempts = 0
        self.locked_until = None
        self.last_login = timezone.now()
        self.save(update_fields=["failed_login_attempts", "locked_until", "last_login"])


class LoginAttempt(models.Model):
    email = models.EmailField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    attempted_at = models.DateTimeField(auto_now_add=True)
    successful = models.BooleanField(default=False)

    class Meta:
        ordering = ["-attempted_at"]
