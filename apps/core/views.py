from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone
from datetime import timedelta

from apps.members.models import Member
from apps.donations.models import Donation


@login_required
def dashboard(request):
    tenant = request.user.tenant
    today = timezone.now().date()
    thirty_days_ago = today - timedelta(days=30)

    # Member stats
    total_members = Member.objects.filter(
        tenant=tenant, deleted_at__isnull=True
    ).count() if tenant else 0
    active_members = Member.objects.filter(
        tenant=tenant, membership_status="active", deleted_at__isnull=True
    ).count() if tenant else 0
    new_members_30d = Member.objects.filter(
        tenant=tenant, created_at__date__gte=thirty_days_ago, deleted_at__isnull=True
    ).count() if tenant else 0

    # Recent donations
    recent_donations = []
    total_donations_30d = 0
    if tenant:
        recent_donations = Donation.objects.filter(
            tenant=tenant, date__gte=thirty_days_ago
        ).select_related("member").order_by("-date")[:10]
        # Count donations (amount is encrypted so we can't sum in DB)
        total_donations_30d = Donation.objects.filter(
            tenant=tenant, date__gte=thirty_days_ago
        ).count()

    # Recent members
    recent_members = []
    if tenant:
        recent_members = Member.objects.filter(
            tenant=tenant, deleted_at__isnull=True
        ).order_by("-created_at")[:5]

    return render(request, "core/dashboard.html", {
        "page_title": "Dashboard",
        "total_members": total_members,
        "active_members": active_members,
        "new_members_30d": new_members_30d,
        "recent_donations": recent_donations,
        "total_donations_30d": total_donations_30d,
        "recent_members": recent_members,
    })
