from django.contrib import admin
from django.urls import path

admin.site.site_header = "GraceDesk Administration"
admin.site.site_title = "GraceDesk"
admin.site.index_title = "Dashboard"

urlpatterns = [
    path("admin/", admin.site.urls),
]
