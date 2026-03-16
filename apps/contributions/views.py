from django.contrib import messages
from django.db.models import Sum, Count, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import Contribution, ContributionCategory, ReportCache
from apps.members.models import Member
from apps.members.views import admin_required, log_action
from apps.core.models import ChurchSettings


@admin_required
def admin_contributions_view(request):
    """List all contributions with filtering."""
    q = request.GET.get("q", "")
    year = request.GET.get("year", "")
    month = request.GET.get("month", "")
    category_id = request.GET.get("category", "")
    method = request.GET.get("method", "")

    qs = Contribution.objects.filter(is_deleted=False).select_related("member", "category", "entered_by")

    if q:
        qs = qs.filter(
            Q(member__first_name__icontains=q) |
            Q(member__last_name__icontains=q) |
            Q(member__email__icontains=q) |
            Q(receipt_number__icontains=q)
        )
    if year:
        qs = qs.filter(date__year=year)
    if month:
        qs = qs.filter(date__month=month)
    if category_id:
        qs = qs.filter(category_id=category_id)
    if method:
        qs = qs.filter(method=method)

    total = qs.aggregate(total=Sum("amount"))["total"] or 0
    categories = ContributionCategory.objects.filter(is_active=True)
    available_years = Contribution.objects.filter(is_deleted=False).dates("date", "year")

    return render(request, "admin/contributions/list.html", {
        "contributions": qs.order_by("-date", "-created_at"),
        "total": total,
        "categories": categories,
        "method_choices": Contribution.METHOD_CHOICES,
        "available_years": available_years,
        "q": q,
        "filter_year": year,
        "filter_month": month,
        "filter_category": category_id,
        "filter_method": method,
    })


@admin_required
@require_http_methods(["GET", "POST"])
def admin_new_contribution_view(request):
    """3-step contribution entry flow."""
    step = request.GET.get("step", "1")

    if request.method == "POST":
        if step == "1":
            # Save form data to session and move to confirmation
            data = {
                "member_id": request.POST.get("member_id", ""),
                "category_id": request.POST.get("category_id", ""),
                "amount": request.POST.get("amount", ""),
                "date": request.POST.get("date", ""),
                "method": request.POST.get("method", ""),
                "notes": request.POST.get("notes", ""),
                "send_email": request.POST.get("send_email") == "on",
            }

            # Validate
            errors = []
            if not data["member_id"]:
                errors.append("Member is required.")
            if not data["category_id"]:
                errors.append("Category is required.")
            if not data["amount"]:
                errors.append("Amount is required.")
            else:
                try:
                    float(data["amount"])
                except ValueError:
                    errors.append("Amount must be a valid number.")
            if not data["date"]:
                errors.append("Date is required.")
            if not data["method"]:
                errors.append("Payment method is required.")

            if errors:
                categories = ContributionCategory.objects.filter(is_active=True)
                return render(request, "admin/contributions/new_step1.html", {
                    "categories": categories,
                    "method_choices": Contribution.METHOD_CHOICES,
                    "errors": errors,
                    "form_data": data,
                })

            request.session["contribution_draft"] = data
            return redirect(reverse("admin_new_contribution") + "?step=2")

        elif step == "2":
            # Confirm and save
            draft = request.session.get("contribution_draft")
            if not draft:
                return redirect(reverse("admin_new_contribution") + "?step=1")

            action = request.POST.get("action", "")
            if action == "back":
                return redirect(reverse("admin_new_contribution") + "?step=1")

            try:
                member = Member.objects.get(pk=draft["member_id"])
                category = ContributionCategory.objects.get(pk=draft["category_id"])
            except (Member.DoesNotExist, ContributionCategory.DoesNotExist):
                messages.error(request, "Invalid member or category.")
                return redirect(reverse("admin_new_contribution") + "?step=1")

            from datetime import date as date_type
            try:
                date_parts = draft["date"].split("-")
                contrib_date = date_type(int(date_parts[0]), int(date_parts[1]), int(date_parts[2]))
            except Exception:
                messages.error(request, "Invalid date format.")
                return redirect(reverse("admin_new_contribution") + "?step=1")

            contribution = Contribution.objects.create(
                member=member,
                category=category,
                amount=draft["amount"],
                date=contrib_date,
                method=draft["method"],
                notes=draft["notes"],
                entered_by=request.user,
            )

            log_action(request.user, "create", "contribution", contribution.pk, {
                "receipt": contribution.receipt_number,
                "amount": str(contribution.amount),
                "member": member.full_name,
            }, request)

            # Send thank you email
            if draft.get("send_email", True):
                from apps.communications.service import send_thank_you_email
                try:
                    send_thank_you_email(contribution)
                except Exception as e:
                    messages.warning(request, f"Contribution saved, but email failed: {e}")

            # Invalidate report cache
            ReportCache.objects.filter(member=member).update(is_valid=False)

            del request.session["contribution_draft"]
            request.session["last_contribution_id"] = contribution.pk
            return redirect(reverse("admin_new_contribution") + "?step=3")

    # GET requests
    if step == "1":
        categories = ContributionCategory.objects.filter(is_active=True)
        form_data = request.session.get("contribution_draft", {})
        return render(request, "admin/contributions/new_step1.html", {
            "categories": categories,
            "method_choices": Contribution.METHOD_CHOICES,
            "form_data": form_data,
            "today": timezone.now().date().isoformat(),
        })
    elif step == "2":
        draft = request.session.get("contribution_draft")
        if not draft:
            return redirect(reverse("admin_new_contribution") + "?step=1")
        try:
            member = Member.objects.get(pk=draft["member_id"])
            category = ContributionCategory.objects.get(pk=draft["category_id"])
        except (Member.DoesNotExist, ContributionCategory.DoesNotExist):
            return redirect(reverse("admin_new_contribution") + "?step=1")

        method_label = dict(Contribution.METHOD_CHOICES).get(draft["method"], draft["method"])
        return render(request, "admin/contributions/new_step2.html", {
            "draft": draft,
            "member": member,
            "category": category,
            "method_label": method_label,
        })
    elif step == "3":
        contrib_id = request.session.get("last_contribution_id")
        contribution = None
        if contrib_id:
            try:
                contribution = Contribution.objects.get(pk=contrib_id)
            except Contribution.DoesNotExist:
                pass
        return render(request, "admin/contributions/new_step3.html", {
            "contribution": contribution,
        })

    return redirect(reverse("admin_new_contribution") + "?step=1")


@admin_required
def admin_contribution_detail_view(request, pk):
    """View contribution details."""
    contribution = get_object_or_404(Contribution, pk=pk)
    return render(request, "admin/contributions/detail.html", {"contribution": contribution})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_edit_contribution_view(request, pk):
    """Edit a contribution."""
    contribution = get_object_or_404(Contribution, pk=pk, is_deleted=False)
    categories = ContributionCategory.objects.filter(is_active=True)
    error = None

    if request.method == "POST":
        category_id = request.POST.get("category_id", "")
        amount = request.POST.get("amount", "")
        date_str = request.POST.get("date", "")
        method = request.POST.get("method", "")
        notes = request.POST.get("notes", "").strip()

        errors = []
        if not category_id:
            errors.append("Category is required.")
        if not amount:
            errors.append("Amount is required.")
        if not date_str:
            errors.append("Date is required.")
        if not method:
            errors.append("Method is required.")

        if not errors:
            try:
                from datetime import date as date_type
                date_parts = date_str.split("-")
                contrib_date = date_type(int(date_parts[0]), int(date_parts[1]), int(date_parts[2]))
                category = ContributionCategory.objects.get(pk=category_id)
                contribution.category = category
                contribution.amount = amount
                contribution.date = contrib_date
                contribution.method = method
                contribution.notes = notes
                contribution.save()
                # Invalidate cache
                ReportCache.objects.filter(member=contribution.member).update(is_valid=False)
                log_action(request.user, "update", "contribution", contribution.pk, {
                    "receipt": contribution.receipt_number
                }, request)
                messages.success(request, "Contribution updated.")
                return redirect("admin_contribution_detail", pk=pk)
            except Exception as e:
                error = str(e)

    return render(request, "admin/contributions/edit_form.html", {
        "contribution": contribution,
        "categories": categories,
        "method_choices": Contribution.METHOD_CHOICES,
        "error": error,
    })


@admin_required
@require_http_methods(["GET", "POST"])
def admin_delete_contribution_view(request, pk):
    """Soft-delete a contribution."""
    contribution = get_object_or_404(Contribution, pk=pk, is_deleted=False)

    if request.method == "POST":
        reason = request.POST.get("reason", "").strip()
        if not reason:
            messages.error(request, "A reason for deletion is required.")
            return render(request, "admin/contributions/delete_confirm.html", {
                "contribution": contribution
            })

        contribution.is_deleted = True
        contribution.deleted_reason = reason
        contribution.deleted_by = request.user
        contribution.deleted_at = timezone.now()
        contribution.save()
        ReportCache.objects.filter(member=contribution.member).update(is_valid=False)
        log_action(request.user, "delete", "contribution", contribution.pk, {
            "receipt": contribution.receipt_number,
            "reason": reason,
        }, request)
        messages.success(request, f"Contribution {contribution.receipt_number} deleted.")
        return redirect("admin_contributions")

    return render(request, "admin/contributions/delete_confirm.html", {
        "contribution": contribution
    })


@admin_required
def admin_reports_view(request):
    """Admin reports overview."""
    current_year = timezone.now().year
    members_with_contributions = Member.objects.filter(
        contributions__is_deleted=False,
        contributions__date__year=current_year,
    ).distinct().order_by("last_name", "first_name")

    year_totals = []
    for year in range(current_year, current_year - 5, -1):
        total = Contribution.objects.filter(
            is_deleted=False, date__year=year
        ).aggregate(total=Sum("amount"))["total"] or 0
        count = Contribution.objects.filter(is_deleted=False, date__year=year).count()
        year_totals.append({"year": year, "total": total, "count": count})

    return render(request, "admin/reports/index.html", {
        "members": members_with_contributions,
        "year_totals": year_totals,
        "current_year": current_year,
    })


@admin_required
@require_http_methods(["GET"])
def admin_generate_report_view(request):
    """Generate and serve a PDF report for any member (admin)."""
    member_id = request.GET.get("member_id")
    year = request.GET.get("year")
    month = request.GET.get("month", "")
    report_all = request.GET.get("all", "")

    if report_all and year:
        # Generate combined report for all members
        year = int(year)
        month_val = int(month) if month else None
        from apps.members.views import _generate_pdf_report
        # All-member summary report
        pdf_bytes = _generate_all_members_pdf(year, month_val)
        filename = f"all_contributions_{year}"
        if month_val:
            import calendar
            filename += f"_{calendar.month_abbr[month_val]}"
        filename += ".pdf"
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        log_action(request.user, "export", "contribution", None, {"year": year, "month": month_val, "all": True}, request)
        return response

    if not member_id or not year:
        return redirect("admin_reports")

    member = get_object_or_404(Member, pk=member_id)
    year = int(year)
    month_val = int(month) if month else None
    report_type = "monthly" if month_val else "annual"

    from apps.members.views import _generate_pdf_report
    pdf_bytes = _generate_pdf_report(member, year, month_val, report_type)

    import calendar
    filename = f"{member.last_name}_{member.first_name}_{year}"
    if month_val:
        filename += f"_{calendar.month_abbr[month_val]}"
    filename += ".pdf"

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    log_action(request.user, "export", "member", member.pk, {"year": year, "month": month_val}, request)
    return response


def _generate_all_members_pdf(year, month):
    """Generate a summary PDF for all members."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO
    import calendar as cal_mod

    church = ChurchSettings.get()
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=0.75*inch, leftMargin=0.75*inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)

    styles = getSampleStyleSheet()
    try:
        hex_color = church.primary_color.lstrip("#")
        r, g, b = tuple(int(hex_color[i:i+2], 16)/255 for i in (0, 2, 4))
        primary_color = colors.Color(r, g, b)
    except Exception:
        primary_color = colors.HexColor("#3B82F6")

    story = []
    story.append(Paragraph(church.church_name, styles["Heading1"]))
    period = f"{year}" if not month else f"{cal_mod.month_name[month]} {year}"
    story.append(Paragraph(f"Contribution Summary — {period}", styles["Heading2"]))
    story.append(Paragraph(f"Generated: {timezone.now().strftime('%B %d, %Y')}", styles["Normal"]))
    story.append(Spacer(1, 0.2*inch))

    qs = Contribution.objects.filter(is_deleted=False, date__year=year)
    if month:
        qs = qs.filter(date__month=month)

    summary = qs.values("member__first_name", "member__last_name", "member__email").annotate(
        total=Sum("amount"), count=Count("id")
    ).order_by("member__last_name", "member__first_name")

    table_data = [["Member", "Email", "# Contributions", "Total"]]
    grand_total = 0
    for row in summary:
        name = f"{row['member__last_name']}, {row['member__first_name']}"
        table_data.append([name, row["member__email"], str(row["count"]), f"${row['total']:,.2f}"])
        grand_total += row["total"]
    table_data.append(["", "", "Grand Total:", f"${grand_total:,.2f}"])

    table = Table(table_data, colWidths=[2*inch, 2.5*inch, 1.5*inch, 1*inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), primary_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.Color(0.95, 0.95, 0.95)]),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
        ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -2), 0.5, colors.lightgrey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()


def member_search_view(request):
    """HTMX-powered member search for contribution entry."""
    if not request.user.is_authenticated or not request.user.is_admin:
        return JsonResponse({"error": "Unauthorized"}, status=403)

    q = request.GET.get("q", "").strip()
    members = []
    if q and len(q) >= 2:
        qs = Member.objects.filter(
            Q(first_name__icontains=q) |
            Q(last_name__icontains=q) |
            Q(email__icontains=q),
            membership_status="active"
        ).order_by("last_name", "first_name")[:10]
        members = [{"id": m.pk, "name": m.full_name, "email": m.email} for m in qs]

    return render(request, "admin/contributions/member_search_results.html", {
        "members": members,
        "q": q,
    })
