from django.contrib import admin
from django.urls import path, include

from apps.core.views import dashboard

admin.site.site_header = "GraceDesk Administration"
admin.site.site_title = "GraceDesk"
admin.site.index_title = "Dashboard"

urlpatterns = [
    path("", dashboard, name="dashboard"),
    path("admin/", admin.site.urls),
    path("accounts/", include("apps.accounts.urls")),
    path("members/", include("apps.members.urls")),
    path("households/", include("apps.members.household_urls")),
    path("donations/", include("apps.donations.urls")),
]
