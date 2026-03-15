from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.db.models import Q

from apps.core.decorators import tenant_required
from .models import Member, Household
from .forms import MemberForm, HouseholdForm


# ── Members ──────────────────────────────────────────────────────────

@login_required
@tenant_required
def member_list(request):
    tenant = request.user.tenant
    members = Member.objects.filter(
        tenant=tenant, deleted_at__isnull=True
    ).select_related("household")

    # Search
    q = request.GET.get("q", "").strip()
    if q:
        members = members.filter(
            Q(first_name__icontains=q) |
            Q(last_name__icontains=q) |
            Q(email__icontains=q) |
            Q(phone__icontains=q)
        )

    # Status filter
    status = request.GET.get("status", "")
    if status:
        members = members.filter(membership_status=status)

    context = {
        "page_title": "Members",
        "members": members,
        "search_query": q,
        "status_filter": status,
        "status_choices": Member.MembershipStatus.choices,
        "total_count": members.count(),
    }

    if request.htmx:
        return render(request, "members/partials/member_table.html", context)
    return render(request, "members/member_list.html", context)


@login_required
@tenant_required
def member_create(request):
    tenant = request.user.tenant
    if request.method == "POST":
        form = MemberForm(request.POST, tenant=tenant)
        if form.is_valid():
            member = form.save(commit=False)
            member.tenant = tenant
            member.save()
            messages.success(request, f"Member {member} created.")
            return redirect("members:detail", pk=member.pk)
    else:
        form = MemberForm(tenant=tenant)
    return render(request, "members/member_form.html", {
        "page_title": "Add Member",
        "form": form,
    })


@login_required
@tenant_required
def member_detail(request, pk):
    tenant = request.user.tenant
    member = get_object_or_404(Member, pk=pk, tenant=tenant, deleted_at__isnull=True)
    donations = member.donations.order_by("-date")[:10]
    return render(request, "members/member_detail.html", {
        "page_title": str(member),
        "member": member,
        "donations": donations,
    })


@login_required
@tenant_required
def member_edit(request, pk):
    tenant = request.user.tenant
    member = get_object_or_404(Member, pk=pk, tenant=tenant, deleted_at__isnull=True)
    if request.method == "POST":
        form = MemberForm(request.POST, instance=member, tenant=tenant)
        if form.is_valid():
            form.save()
            messages.success(request, f"Member {member} updated.")
            return redirect("members:detail", pk=member.pk)
    else:
        form = MemberForm(instance=member, tenant=tenant)
    return render(request, "members/member_form.html", {
        "page_title": f"Edit {member}",
        "form": form,
        "member": member,
    })


@login_required
@tenant_required
def member_delete(request, pk):
    tenant = request.user.tenant
    member = get_object_or_404(Member, pk=pk, tenant=tenant, deleted_at__isnull=True)
    if request.method == "POST":
        member.deleted_at = timezone.now()
        member.save()
        messages.success(request, f"Member {member} removed.")
        return redirect("members:list")
    return render(request, "members/member_confirm_delete.html", {
        "page_title": f"Remove {member}",
        "member": member,
    })


# ── Households ───────────────────────────────────────────────────────

@login_required
@tenant_required
def household_list(request):
    tenant = request.user.tenant
    households = Household.objects.filter(tenant=tenant).prefetch_related("members")

    q = request.GET.get("q", "").strip()
    if q:
        households = households.filter(
            Q(family_name__icontains=q) |
            Q(city__icontains=q)
        )

    context = {
        "page_title": "Households",
        "households": households,
        "search_query": q,
        "total_count": households.count(),
    }
    if request.htmx:
        return render(request, "households/partials/household_table.html", context)
    return render(request, "households/household_list.html", context)


@login_required
@tenant_required
def household_create(request):
    tenant = request.user.tenant
    if request.method == "POST":
        form = HouseholdForm(request.POST)
        if form.is_valid():
            household = form.save(commit=False)
            household.tenant = tenant
            household.save()
            messages.success(request, f"Household '{household}' created.")
            return redirect("households:detail", pk=household.pk)
    else:
        form = HouseholdForm()
    return render(request, "households/household_form.html", {
        "page_title": "Add Household",
        "form": form,
    })


@login_required
@tenant_required
def household_detail(request, pk):
    tenant = request.user.tenant
    household = get_object_or_404(Household, pk=pk, tenant=tenant)
    members = household.members.filter(deleted_at__isnull=True)
    return render(request, "households/household_detail.html", {
        "page_title": household.family_name,
        "household": household,
        "members": members,
    })


@login_required
@tenant_required
def household_edit(request, pk):
    tenant = request.user.tenant
    household = get_object_or_404(Household, pk=pk, tenant=tenant)
    if request.method == "POST":
        form = HouseholdForm(request.POST, instance=household)
        if form.is_valid():
            form.save()
            messages.success(request, f"Household '{household}' updated.")
            return redirect("households:detail", pk=household.pk)
    else:
        form = HouseholdForm(instance=household)
    return render(request, "households/household_form.html", {
        "page_title": f"Edit {household.family_name}",
        "form": form,
        "household": household,
    })


@login_required
@tenant_required
def household_delete(request, pk):
    tenant = request.user.tenant
    household = get_object_or_404(Household, pk=pk, tenant=tenant)
    if request.method == "POST":
        household.delete()
        messages.success(request, f"Household '{household}' deleted.")
        return redirect("households:list")
    return render(request, "households/household_confirm_delete.html", {
        "page_title": f"Delete {household.family_name}",
        "household": household,
    })
