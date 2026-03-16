from django.urls import path
from . import views

urlpatterns = [
    path("admin-panel/contributions/", views.admin_contributions_view, name="admin_contributions"),
    path("admin-panel/contributions/new/", views.admin_new_contribution_view, name="admin_new_contribution"),
    path("admin-panel/contributions/<int:pk>/", views.admin_contribution_detail_view, name="admin_contribution_detail"),
    path("admin-panel/contributions/<int:pk>/edit/", views.admin_edit_contribution_view, name="admin_edit_contribution"),
    path("admin-panel/contributions/<int:pk>/delete/", views.admin_delete_contribution_view, name="admin_delete_contribution"),
    path("admin-panel/reports/", views.admin_reports_view, name="admin_reports"),
    path("admin-panel/reports/generate/", views.admin_generate_report_view, name="admin_generate_report"),
    path("admin-panel/members/search/", views.member_search_view, name="member_search"),
]
