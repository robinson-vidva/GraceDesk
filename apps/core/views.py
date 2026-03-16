from django.shortcuts import render


def home_view(request):
    """Landing page."""
    if request.user.is_authenticated:
        from django.shortcuts import redirect
        if request.user.is_admin:
            return redirect("admin_dashboard")
        return redirect("dashboard")
    return render(request, "core/home.html")


def terms_view(request):
    """Terms of service page."""
    return render(request, "core/terms.html")
