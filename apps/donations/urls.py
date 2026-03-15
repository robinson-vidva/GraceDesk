from django.urls import path
from . import views

app_name = "donations"

urlpatterns = [
    path("", views.donation_list, name="list"),
    path("add/", views.donation_create, name="create"),
    path("<int:pk>/", views.donation_detail, name="detail"),
    path("<int:pk>/edit/", views.donation_edit, name="edit"),
    # Batches
    path("batches/", views.batch_list, name="batch_list"),
    path("batches/add/", views.batch_create, name="batch_create"),
    path("batches/<int:pk>/", views.batch_detail, name="batch_detail"),
]
