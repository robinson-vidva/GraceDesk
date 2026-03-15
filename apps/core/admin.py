from django.contrib import admin

from .models import AuditLog, Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "currency", "timezone", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("currency",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "entity_type", "entity_id", "user", "created_at")
    search_fields = ("entity_type", "entity_id", "user__username")
    list_filter = ("action", "entity_type", "created_at")
    readonly_fields = (
        "tenant", "user", "action", "entity_type", "entity_id",
        "before_value", "after_value", "ip_address", "user_agent", "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
