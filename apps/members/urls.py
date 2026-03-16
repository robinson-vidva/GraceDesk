from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.dashboard_view, name="dashboard"),
    path("contributions/", views.my_contributions_view, name="my_contributions"),
    path("contributions/reports/", views.download_reports_view, name="download_reports"),
    path("contributions/reports/download/", views.generate_report_view, name="generate_report"),
    path("profile/", views.profile_view, name="profile"),
    # Admin — members
    path("admin-panel/", views.admin_dashboard_view, name="admin_dashboard"),
    path("admin-panel/members/", views.admin_members_view, name="admin_members"),
    path("admin-panel/members/pending/", views.admin_pending_view, name="admin_pending"),
    path("admin-panel/members/new/", views.admin_new_member_view, name="admin_new_member"),
    path("admin-panel/members/<int:pk>/", views.admin_member_detail_view, name="admin_member_detail"),
    path("admin-panel/members/<int:pk>/edit/", views.admin_member_edit_view, name="admin_member_edit"),
    path("admin-panel/members/<int:pk>/approve/", views.admin_approve_member_view, name="admin_approve_member"),
    path("admin-panel/members/<int:pk>/reject/", views.admin_reject_member_view, name="admin_reject_member"),
    path("admin-panel/members/<int:pk>/deactivate/", views.admin_deactivate_member_view, name="admin_deactivate_member"),
    # Admin — families
    path("admin-panel/families/", views.admin_families_view, name="admin_families"),
    path("admin-panel/families/new/", views.admin_new_family_view, name="admin_new_family"),
    path("admin-panel/families/<int:pk>/", views.admin_family_detail_view, name="admin_family_detail"),
    path("admin-panel/families/<int:pk>/edit/", views.admin_family_edit_view, name="admin_family_edit"),
    # Admin — users
    path("admin-panel/users/", views.admin_users_view, name="admin_users"),
    path("admin-panel/users/<int:pk>/promote/", views.admin_promote_user_view, name="admin_promote_user"),
    path("admin-panel/users/<int:pk>/toggle-active/", views.admin_toggle_user_active_view, name="admin_toggle_user_active"),
    # Admin — settings
    path("admin-panel/settings/", views.admin_settings_view, name="admin_settings"),
    path("admin-panel/settings/categories/", views.admin_categories_view, name="admin_categories"),
    path("admin-panel/settings/categories/new/", views.admin_new_category_view, name="admin_new_category"),
    path("admin-panel/settings/categories/<int:pk>/edit/", views.admin_edit_category_view, name="admin_edit_category"),
    path("admin-panel/settings/bible-verses/", views.admin_bible_verses_view, name="admin_bible_verses"),
    path("admin-panel/settings/bible-verses/new/", views.admin_new_bible_verse_view, name="admin_new_bible_verse"),
    path("admin-panel/settings/bible-verses/<int:pk>/edit/", views.admin_edit_bible_verse_view, name="admin_edit_bible_verse"),
    # Admin — audit log
    path("admin-panel/audit-log/", views.admin_audit_log_view, name="admin_audit_log"),
]
