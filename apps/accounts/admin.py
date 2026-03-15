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

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(tenant=request.user.tenant)

    def save_model(self, request, obj, form, change):
        if not request.user.is_superuser and not obj.tenant_id:
            obj.tenant = request.user.tenant
        super().save_model(request, obj, form, change)
