from django.contrib import admin

from .models import Household, Member


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ("family_name", "city", "state", "home_phone", "tenant", "created_at")
    search_fields = ("family_name", "city", "address_line1")
    list_filter = ("state", "city", "tenant")


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = (
        "first_name", "last_name", "email", "phone",
        "membership_status", "household_role", "household", "tenant",
    )
    search_fields = ("first_name", "last_name", "email", "phone")
    list_filter = ("membership_status", "household_role", "gender", "tenant")
    raw_id_fields = ("household",)
    date_hierarchy = "created_at"
