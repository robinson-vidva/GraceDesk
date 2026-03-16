from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, LoginAttempt


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "first_name", "last_name", "is_admin", "is_active", "created_at"]
    list_filter = ["is_admin", "is_active", "can_manage_admins"]
    search_fields = ["email", "first_name", "last_name"]
    ordering = ["email"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Personal Info", {"fields": ["first_name", "last_name", "member"]}),
        ("Permissions", {"fields": [
            "is_active", "is_admin", "can_manage_admins", "is_staff", "is_superuser",
            "must_change_password", "groups", "user_permissions",
        ]}),
        ("Security", {"fields": ["failed_login_attempts", "locked_until"]}),
        ("Dates", {"fields": ["last_login", "created_at", "updated_at"]}),
    ]
    readonly_fields = ["created_at", "updated_at", "last_login"]
    add_fieldsets = [
        (None, {
            "classes": ["wide"],
            "fields": ["email", "password1", "password2", "first_name", "last_name", "is_active", "is_admin"],
        }),
    ]


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ["email", "ip_address", "successful", "attempted_at"]
    list_filter = ["successful"]
    readonly_fields = ["email", "ip_address", "attempted_at", "successful"]
