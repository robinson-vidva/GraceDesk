from functools import wraps

from django.contrib import messages
from django.shortcuts import redirect


def tenant_required(view_func):
    """Ensure the logged-in user has a tenant assigned."""

    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not getattr(request.user, "tenant_id", None):
            messages.error(
                request,
                "Your account is not associated with a church. "
                "Please contact an administrator.",
            )
            return redirect("dashboard")
        return view_func(request, *args, **kwargs)

    return _wrapped
