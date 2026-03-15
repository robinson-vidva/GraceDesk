from django.contrib import admin

from apps.core.admin import TenantScopedAdmin
from .models import Donation, DonationBatch, Pledge


@admin.register(DonationBatch)
class DonationBatchAdmin(TenantScopedAdmin):
    list_display = ("batch_date", "description", "status", "expected_total", "actual_total", "created_by", "tenant")
    search_fields = ("description",)
    list_filter = ("status", "batch_date", "tenant")
    raw_id_fields = ("created_by", "closed_by")


@admin.register(Donation)
class DonationAdmin(TenantScopedAdmin):
    list_display = ("date", "member", "type", "payment_method", "fiscal_year", "is_anonymous", "tenant")
    search_fields = ("member__first_name", "member__last_name", "receipt_number", "notes")
    list_filter = ("type", "payment_method", "fiscal_year", "is_anonymous", "tenant")
    raw_id_fields = ("member", "batch")
    date_hierarchy = "date"


@admin.register(Pledge)
class PledgeAdmin(TenantScopedAdmin):
    list_display = ("member", "amount", "frequency", "start_date", "end_date", "status", "fiscal_year", "tenant")
    search_fields = ("member__first_name", "member__last_name")
    list_filter = ("status", "frequency", "fiscal_year", "tenant")
    raw_id_fields = ("member",)
