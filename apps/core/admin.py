from django.contrib import admin

from .models import AuditLog, Tenant


class TenantScopedAdmin(admin.ModelAdmin):
    """Base admin that scopes querysets and saves to the logged-in user's tenant.

    Superusers see all data across tenants.
    Staff users only see their own tenant's data.
    """

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(tenant=request.user.tenant)

    def save_model(self, request, obj, form, change):
        if not obj.tenant_id and not request.user.is_superuser:
            obj.tenant = request.user.tenant
        super().save_model(request, obj, form, change)

    def get_list_filter(self, request):
        list_filter = list(super().get_list_filter(request))
        # Only superusers need the tenant filter — staff see one tenant only
        if not request.user.is_superuser and "tenant" in list_filter:
            list_filter.remove("tenant")
        return list_filter

    def get_list_display(self, request):
        list_display = list(super().get_list_display(request))
        # Hide tenant column for non-superusers
        if not request.user.is_superuser and "tenant" in list_display:
            list_display.remove("tenant")
        return list_display

    def get_exclude(self, request, obj=None):
        exclude = list(super().get_exclude(request, obj) or [])
        # Hide tenant field in forms for non-superusers
        if not request.user.is_superuser:
            exclude.append("tenant")
        return exclude or None

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        """Scope foreign key dropdowns to the user's tenant."""
        if not request.user.is_superuser and hasattr(db_field.related_model, "tenant"):
            if db_field.name != "tenant":
                kwargs["queryset"] = db_field.related_model.objects.filter(
                    tenant=request.user.tenant
                )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "currency", "timezone", "created_at")
    search_fields = ("name", "slug")
    list_filter = ("currency",)
    prepopulated_fields = {"slug": ("name",)}

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        # Staff users can only see their own tenant
        return qs.filter(pk=request.user.tenant_id)

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser


@admin.register(AuditLog)
class AuditLogAdmin(TenantScopedAdmin):
    list_display = ("action", "entity_type", "entity_id", "user", "created_at", "tenant")
    search_fields = ("entity_type", "entity_id", "user__username")
    list_filter = ("action", "entity_type", "created_at", "tenant")
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

    def get_exclude(self, request, obj=None):
        # Don't hide tenant for audit logs — it's in readonly_fields
        return None
