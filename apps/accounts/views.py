import requests
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.tokens import default_token_generator
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.shortcuts import render, redirect, get_object_or_404
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.contrib import messages
from django.views.decorators.http import require_http_methods

from .models import User, LoginAttempt
from apps.core.models import ChurchSettings


def get_client_ip(request):
    """Get the real client IP address."""
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def verify_turnstile(token, secret_key):
    """Verify Cloudflare Turnstile token. Returns True if valid or no key configured."""
    if not secret_key:
        return True  # Skip verification in dev mode
    try:
        resp = requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret_key, "response": token},
            timeout=5,
        )
        data = resp.json()
        return data.get("success", False)
    except Exception:
        return True  # Fail open if Turnstile is unreachable


@require_http_methods(["GET", "POST"])
def login_view(request):
    """Email + password login with progressive lockout and Turnstile."""
    if request.user.is_authenticated:
        return redirect("dashboard")

    church = ChurchSettings.get()
    error = None
    lockout_remaining = None

    if request.method == "POST":
        email = request.POST.get("email", "").strip().lower()
        password = request.POST.get("password", "")
        turnstile_token = request.POST.get("cf-turnstile-response", "")
        ip = get_client_ip(request)
        user_agent = request.META.get("HTTP_USER_AGENT", "")

        # Log the attempt
        LoginAttempt.objects.create(email=email, ip_address=ip)

        # Verify Turnstile
        if not verify_turnstile(turnstile_token, church.turnstile_secret_key):
            error = "Bot verification failed. Please try again."
        else:
            try:
                user_obj = User.objects.get(email=email)
            except User.DoesNotExist:
                user_obj = None

            if user_obj and user_obj.is_locked():
                from django.utils import timezone
                remaining = (user_obj.locked_until - timezone.now()).seconds // 60 + 1
                lockout_remaining = remaining
                error = f"Account locked. Try again in {remaining} minute(s)."
            else:
                user = authenticate(request, username=email, password=password)
                if user is not None:
                    if not user.is_active:
                        error = "Your account is not yet active. Please wait for admin approval."
                    else:
                        user.record_successful_login()
                        LoginAttempt.objects.filter(email=email).order_by("-attempted_at").first()
                        LoginAttempt.objects.create(email=email, ip_address=ip, successful=True)
                        login(request, user)

                        if user.must_change_password:
                            return redirect("force_password_change")

                        if user.is_admin:
                            return redirect("admin_dashboard")
                        return redirect("dashboard")
                else:
                    if user_obj:
                        user_obj.record_failed_login()
                        if user_obj.is_locked():
                            remaining = (user_obj.locked_until - timezone.now()).seconds // 60 + 1
                            error = f"Too many failed attempts. Account locked for {remaining} minute(s)."
                        else:
                            remaining_attempts = 5 - user_obj.failed_login_attempts
                            if remaining_attempts > 0:
                                error = f"Invalid email or password. {remaining_attempts} attempt(s) remaining before lockout."
                            else:
                                error = "Invalid email or password."
                    else:
                        error = "Invalid email or password."

    return render(request, "accounts/login.html", {
        "error": error,
        "lockout_remaining": lockout_remaining,
        "church": church,
    })


@login_required
def logout_view(request):
    """Log out the current user."""
    logout(request)
    return redirect("login")


@require_http_methods(["GET", "POST"])
def register_view(request):
    """Self-registration: creates pending Member + inactive User."""
    if request.user.is_authenticated:
        return redirect("dashboard")

    church = ChurchSettings.get()
    error = None
    form_data = {}

    if request.method == "POST":
        form_data = {
            "first_name": request.POST.get("first_name", "").strip(),
            "last_name": request.POST.get("last_name", "").strip(),
            "email": request.POST.get("email", "").strip().lower(),
            "phone": request.POST.get("phone", "").strip(),
            "password": request.POST.get("password", ""),
            "password2": request.POST.get("password2", ""),
        }
        turnstile_token = request.POST.get("cf-turnstile-response", "")

        # Validate
        if not all([form_data["first_name"], form_data["last_name"], form_data["email"], form_data["password"]]):
            error = "All required fields must be filled in."
        elif form_data["password"] != form_data["password2"]:
            error = "Passwords do not match."
        elif len(form_data["password"]) < 8:
            error = "Password must be at least 8 characters."
        elif not verify_turnstile(turnstile_token, church.turnstile_secret_key):
            error = "Bot verification failed. Please try again."
        else:
            try:
                validate_email(form_data["email"])
            except ValidationError:
                error = "Please enter a valid email address."
            else:
                if User.objects.filter(email=form_data["email"]).exists():
                    error = "An account with this email already exists."
                else:
                    from apps.members.models import Member
                    member = Member.objects.create(
                        first_name=form_data["first_name"],
                        last_name=form_data["last_name"],
                        email=form_data["email"],
                        phones=form_data["phone"],
                        membership_status="pending",
                    )
                    User.objects.create_user(
                        email=form_data["email"],
                        password=form_data["password"],
                        first_name=form_data["first_name"],
                        last_name=form_data["last_name"],
                        is_active=False,
                        member=member,
                    )
                    messages.success(
                        request,
                        "Registration successful! Your account is pending approval. "
                        "You will receive an email once approved."
                    )
                    return redirect("login")

    return render(request, "accounts/register.html", {
        "error": error,
        "form_data": form_data,
        "church": church,
    })


@require_http_methods(["GET", "POST"])
def forgot_password_view(request):
    """Send a password reset email."""
    church = ChurchSettings.get()
    sent = False

    if request.method == "POST":
        email = request.POST.get("email", "").strip().lower()
        turnstile_token = request.POST.get("cf-turnstile-response", "")

        if verify_turnstile(turnstile_token, church.turnstile_secret_key):
            try:
                user = User.objects.get(email=email)
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                token = default_token_generator.make_token(user)
                reset_url = request.build_absolute_uri(
                    f"/password-reset/{uid}/{token}/"
                )
                from apps.communications.service import send_password_reset_email
                send_password_reset_email(user, reset_url)
            except User.DoesNotExist:
                pass  # Don't reveal if email exists

        sent = True  # Always show success to prevent email enumeration

    return render(request, "accounts/forgot_password.html", {
        "sent": sent,
        "church": church,
    })


@require_http_methods(["GET", "POST"])
def password_reset_confirm_view(request, uidb64, token):
    """Handle password reset confirmation."""
    church = ChurchSettings.get()
    error = None
    valid_link = False

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
        if default_token_generator.check_token(user, token):
            valid_link = True
        else:
            error = "This password reset link is invalid or has expired."
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        error = "This password reset link is invalid."

    if request.method == "POST" and valid_link:
        password = request.POST.get("password", "")
        password2 = request.POST.get("password2", "")
        if not password:
            error = "Password is required."
        elif password != password2:
            error = "Passwords do not match."
        elif len(password) < 8:
            error = "Password must be at least 8 characters."
        else:
            user.set_password(password)
            user.must_change_password = False
            user.save()
            messages.success(request, "Password changed successfully. Please log in.")
            return redirect("login")

    return render(request, "accounts/password_reset_confirm.html", {
        "error": error,
        "valid_link": valid_link,
        "church": church,
    })


@login_required
@require_http_methods(["GET", "POST"])
def force_password_change_view(request):
    """Force password change after first login."""
    church = ChurchSettings.get()
    error = None

    if not request.user.must_change_password:
        return redirect("dashboard")

    if request.method == "POST":
        password = request.POST.get("password", "")
        password2 = request.POST.get("password2", "")
        if not password:
            error = "Password is required."
        elif password != password2:
            error = "Passwords do not match."
        elif len(password) < 8:
            error = "Password must be at least 8 characters."
        else:
            request.user.set_password(password)
            request.user.must_change_password = False
            request.user.save()
            # Re-authenticate to avoid session invalidation
            from django.contrib.auth import update_session_auth_hash
            update_session_auth_hash(request, request.user)
            messages.success(request, "Password changed successfully.")
            if request.user.is_admin:
                return redirect("admin_dashboard")
            return redirect("dashboard")

    return render(request, "accounts/force_password_change.html", {
        "error": error,
        "church": church,
    })
