from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.shortcuts import render, redirect, get_object_or_404
from django.db.models import Q

from apps.core.decorators import tenant_required
from .models import Donation, DonationBatch
from .forms import DonationForm, DonationBatchForm


@login_required
@tenant_required
def donation_list(request):
    tenant = request.user.tenant
    donations = Donation.objects.filter(tenant=tenant).select_related("member", "batch")

    q = request.GET.get("q", "").strip()
    if q:
        donations = donations.filter(
            Q(member__first_name__icontains=q) |
            Q(member__last_name__icontains=q) |
            Q(receipt_number__icontains=q) |
            Q(notes__icontains=q)
        )

    donation_type = request.GET.get("type", "")
    if donation_type:
        donations = donations.filter(type=donation_type)

    context = {
        "page_title": "Donations",
        "donations": donations[:100],
        "search_query": q,
        "type_filter": donation_type,
        "type_choices": Donation.DonationType.choices,
        "total_count": donations.count(),
    }
    if request.htmx:
        return render(request, "donations/partials/donation_table.html", context)
    return render(request, "donations/donation_list.html", context)


@login_required
@tenant_required
def donation_create(request):
    tenant = request.user.tenant
    if request.method == "POST":
        form = DonationForm(request.POST, tenant=tenant)
        if form.is_valid():
            donation = form.save(commit=False)
            donation.tenant = tenant
            donation.save()
            messages.success(request, "Donation recorded.")
            return redirect("donations:list")
    else:
        form = DonationForm(tenant=tenant)
    return render(request, "donations/donation_form.html", {
        "page_title": "Record Donation",
        "form": form,
    })


@login_required
@tenant_required
def donation_detail(request, pk):
    tenant = request.user.tenant
    donation = get_object_or_404(Donation, pk=pk, tenant=tenant)
    return render(request, "donations/donation_detail.html", {
        "page_title": f"Donation #{donation.pk}",
        "donation": donation,
    })


@login_required
@tenant_required
def donation_edit(request, pk):
    tenant = request.user.tenant
    donation = get_object_or_404(Donation, pk=pk, tenant=tenant)
    if request.method == "POST":
        form = DonationForm(request.POST, instance=donation, tenant=tenant)
        if form.is_valid():
            form.save()
            messages.success(request, "Donation updated.")
            return redirect("donations:detail", pk=donation.pk)
    else:
        form = DonationForm(instance=donation, tenant=tenant)
    return render(request, "donations/donation_form.html", {
        "page_title": f"Edit Donation #{donation.pk}",
        "form": form,
        "donation": donation,
    })


# ── Batches ──────────────────────────────────────────────────────────

@login_required
@tenant_required
def batch_list(request):
    tenant = request.user.tenant
    batches = DonationBatch.objects.filter(tenant=tenant)
    return render(request, "donations/batch_list.html", {
        "page_title": "Donation Batches",
        "batches": batches,
    })


@login_required
@tenant_required
def batch_create(request):
    tenant = request.user.tenant
    if request.method == "POST":
        form = DonationBatchForm(request.POST)
        if form.is_valid():
            batch = form.save(commit=False)
            batch.tenant = tenant
            batch.created_by = request.user
            batch.save()
            messages.success(request, f"Batch created for {batch.batch_date}.")
            return redirect("donations:batch_detail", pk=batch.pk)
    else:
        form = DonationBatchForm()
    return render(request, "donations/batch_form.html", {
        "page_title": "Create Batch",
        "form": form,
    })


@login_required
@tenant_required
def batch_detail(request, pk):
    tenant = request.user.tenant
    batch = get_object_or_404(DonationBatch, pk=pk, tenant=tenant)
    donations = batch.donations.select_related("member")
    return render(request, "donations/batch_detail.html", {
        "page_title": f"Batch {batch.batch_date}",
        "batch": batch,
        "donations": donations,
    })
