from django.urls import path
from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("register/", views.register_view, name="register"),
    path("forgot-password/", views.forgot_password_view, name="forgot_password"),
    path("password-reset/<uidb64>/<token>/", views.password_reset_confirm_view, name="password_reset_confirm"),
    path("change-password/", views.force_password_change_view, name="force_password_change"),
]
