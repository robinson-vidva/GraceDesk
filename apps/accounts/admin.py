from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "first_name", "last_name", "tenant", "is_staff", "is_active")
    search_fields = ("username", "email", "first_name", "last_name")
    list_filter = ("is_staff", "is_active", "is_superuser", "tenant")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("GraceDesk", {"fields": ("tenant", "phone")}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("GraceDesk", {"fields": ("tenant", "phone")}),
    )
