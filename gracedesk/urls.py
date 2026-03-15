from django.contrib import admin
from django.urls import path
from django.views.generic import RedirectView

admin.site.site_header = "GraceDesk Administration"
admin.site.site_title = "GraceDesk"
admin.site.index_title = "Dashboard"

urlpatterns = [
    path("", RedirectView.as_view(url="/admin/", permanent=False)),
    path("admin/", admin.site.urls),
]
