from django.urls import path
from . import views

app_name = "households"

urlpatterns = [
    path("", views.household_list, name="list"),
    path("add/", views.household_create, name="create"),
    path("<int:pk>/", views.household_detail, name="detail"),
    path("<int:pk>/edit/", views.household_edit, name="edit"),
    path("<int:pk>/delete/", views.household_delete, name="delete"),
]
