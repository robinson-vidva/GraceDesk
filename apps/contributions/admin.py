from django.contrib import admin
from .models import ContributionCategory, Contribution, ReportCache


@admin.register(ContributionCategory)
class ContributionCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active", "display_order", "created_at"]
    list_filter = ["is_active"]
    ordering = ["display_order", "name"]


@admin.register(Contribution)
class ContributionAdmin(admin.ModelAdmin):
    list_display = ["receipt_number", "member", "category", "amount", "date", "method", "is_deleted"]
    list_filter = ["method", "category", "is_deleted", "date"]
    search_fields = ["receipt_number", "member__first_name", "member__last_name", "member__email"]
    raw_id_fields = ["member"]
    readonly_fields = ["receipt_number", "created_at", "updated_at"]


@admin.register(ReportCache)
class ReportCacheAdmin(admin.ModelAdmin):
    list_display = ["member", "report_type", "period_year", "period_month", "is_valid", "generated_at"]
    list_filter = ["report_type", "is_valid"]
