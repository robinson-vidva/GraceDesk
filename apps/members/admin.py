from django.contrib import admin
from .models import Member, Family, FamilyRelationship


class FamilyRelationshipInline(admin.TabularInline):
    model = FamilyRelationship
    extra = 0


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    list_display = ["family_name", "head_member", "created_at"]
    search_fields = ["family_name"]
    inlines = [FamilyRelationshipInline]


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ["full_name", "email", "membership_status", "family", "family_role", "created_at"]
    list_filter = ["membership_status", "family_role"]
    search_fields = ["first_name", "last_name", "email"]
    raw_id_fields = ["family"]
