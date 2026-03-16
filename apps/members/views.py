from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Sum, Count, Q
from django.http import HttpResponse, Http404
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from functools import wraps

from .models import Member, Family, FamilyRelationship
from apps.accounts.models import User
from apps.contributions.models import Contribution, ContributionCategory, ReportCache
from apps.communications.models import BibleVerse, EmailLog
from apps.core.models import ChurchSettings, AuditLog


# ─── Decorators ────────────────────────────────────────────────────────────────

def admin_required(view_func):
    """Decorator that requires the user to be an admin."""
    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            from django.conf import settings
            return redirect(settings.LOGIN_URL)
        if not request.user.is_admin:
            raise Http404
        return view_func(request, *args, **kwargs)
    return _wrapped


def log_action(user, action, entity_type="", entity_id=None, details=None, request=None):
    """Create an audit log entry."""
    ip = None
    user_agent = ""
    if request:
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = x_forwarded.split(",")[0].strip() if x_forwarded else request.META.get("REMOTE_ADDR")
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:500]
    AuditLog.objects.create(
        user=user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip,
        user_agent=user_agent,
    )


# ─── Member-facing views ───────────────────────────────────────────────────────

@login_required
def dashboard_view(request):
    """Member dashboard."""
    user = request.user
    member = user.member

    if user.is_admin and not member:
        return redirect("admin_dashboard")

    context = {"member": member}
    if member:
        # Recent contributions
        contribs = Contribution.objects.filter(
            member=member, is_deleted=False
        ).select_related("category").order_by("-date")[:5]
        total_ytd = Contribution.objects.filter(
            member=member, is_deleted=False, date__year=timezone.now().year
        ).aggregate(total=Sum("amount"))["total"] or 0

        # Family contributions if head
        family_total_ytd = 0
        family_members = []
        if member.is_family_head() and member.family:
            family_members = member.family.members.exclude(pk=member.pk)
            family_ids = list(member.family.members.values_list("pk", flat=True))
            family_total_ytd = Contribution.objects.filter(
                member_id__in=family_ids, is_deleted=False, date__year=timezone.now().year
            ).aggregate(total=Sum("amount"))["total"] or 0

        context.update({
            "recent_contributions": contribs,
            "total_ytd": total_ytd,
            "family_total_ytd": family_total_ytd,
            "family_members": family_members,
        })

    return render(request, "members/dashboard.html", context)


@login_required
def my_contributions_view(request):
    """View own contributions with filtering."""
    member = request.user.member
    if not member:
        return redirect("dashboard")

    year = request.GET.get("year", "")
    month = request.GET.get("month", "")
    category_id = request.GET.get("category", "")

    qs = Contribution.objects.filter(member=member, is_deleted=False).select_related("category")

    if year:
        qs = qs.filter(date__year=year)
    if month:
        qs = qs.filter(date__month=month)
    if category_id:
        qs = qs.filter(category_id=category_id)

    total = qs.aggregate(total=Sum("amount"))["total"] or 0
    categories = ContributionCategory.objects.filter(is_active=True)
    years = Contribution.objects.filter(member=member, is_deleted=False).dates("date", "year")

    # Family contributions if head
    family_contribs = None
    if member.is_family_head() and member.family:
        family_ids = list(member.family.members.values_list("pk", flat=True))
        family_qs = Contribution.objects.filter(
            member_id__in=family_ids, is_deleted=False
        ).select_related("member", "category")
        if year:
            family_qs = family_qs.filter(date__year=year)
        if month:
            family_qs = family_qs.filter(date__month=month)
        family_contribs = family_qs.exclude(member=member)

    return render(request, "members/contributions.html", {
        "contributions": qs,
        "total": total,
        "categories": categories,
        "years": years,
        "filter_year": year,
        "filter_month": month,
        "filter_category": category_id,
        "family_contribs": family_contribs,
    })


@login_required
def download_reports_view(request):
    """Show available reports to download."""
    member = request.user.member
    if not member:
        return redirect("dashboard")

    current_year = timezone.now().year
    years = list(range(current_year, current_year - 5, -1))

    # Check which annual reports have data
    available_years = []
    for y in years:
        has_data = Contribution.objects.filter(member=member, date__year=y, is_deleted=False).exists()
        if has_data:
            available_years.append(y)

    return render(request, "members/reports.html", {
        "available_years": available_years,
        "current_year": current_year,
    })


@login_required
def generate_report_view(request):
    """Generate and serve a PDF contribution report."""
    member = request.user.member
    if not member:
        return redirect("dashboard")

    year = request.GET.get("year")
    month = request.GET.get("month")
    report_type = "monthly" if month else "annual"

    if not year:
        return redirect("download_reports")

    year = int(year)
    month = int(month) if month else None

    # Generate PDF
    pdf_bytes = _generate_pdf_report(member, year, month, report_type)

    filename = f"contributions_{year}"
    if month:
        filename += f"_{month:02d}"
    filename += ".pdf"

    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'

    log_action(request.user, "export", "member", member.pk, {"year": year, "month": month}, request)
    return response


def _generate_pdf_report(member, year, month, report_type):
    """Generate a PDF report using reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from io import BytesIO
    import calendar

    church = ChurchSettings.get()
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=0.75*inch, leftMargin=0.75*inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)

    styles = getSampleStyleSheet()
    # Convert hex to RGB
    try:
        hex_color = church.primary_color.lstrip("#")
        r, g, b = tuple(int(hex_color[i:i+2], 16)/255 for i in (0, 2, 4))
        primary_color = colors.Color(r, g, b)
    except Exception:
        primary_color = colors.HexColor("#3B82F6")

    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        textColor=primary_color, fontSize=18, spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        "Subtitle", parent=styles["Normal"],
        fontSize=10, textColor=colors.grey, spaceAfter=12
    )
    header_style = ParagraphStyle(
        "Header", parent=styles["Heading2"],
        fontSize=12, textColor=primary_color, spaceBefore=12, spaceAfter=6
    )

    story = []

    # Header
    story.append(Paragraph(church.church_name, title_style))
    story.append(Paragraph("Contribution Report", styles["Heading2"]))
    story.append(Spacer(1, 0.1*inch))

    # Member info
    period_label = f"{year}"
    if month:
        period_label = f"{calendar.month_name[month]} {year}"

    story.append(Paragraph(f"Member: {member.full_name}", styles["Normal"]))
    story.append(Paragraph(f"Email: {member.email}", styles["Normal"]))
    story.append(Paragraph(f"Period: {period_label}", styles["Normal"]))
    story.append(Paragraph(f"Generated: {timezone.now().strftime('%B %d, %Y')}", styles["Normal"]))
    if church.ein_tax_id:
        story.append(Paragraph(f"Tax ID (EIN): {church.ein_tax_id}", styles["Normal"]))
    story.append(Spacer(1, 0.2*inch))

    # Contributions
    qs = Contribution.objects.filter(member=member, is_deleted=False, date__year=year)
    if month:
        qs = qs.filter(date__month=month)
    qs = qs.select_related("category").order_by("date")

    if not qs.exists():
        story.append(Paragraph("No contributions found for this period.", styles["Normal"]))
    else:
        # Table
        table_data = [["Date", "Category", "Method", "Receipt #", "Amount"]]
        total = 0
        for c in qs:
            table_data.append([
                c.date.strftime("%m/%d/%Y"),
                c.category.name,
                c.get_method_display(),
                c.receipt_number,
                f"${c.amount:,.2f}",
            ])
            total += c.amount

        table_data.append(["", "", "", "Total:", f"${total:,.2f}"])

        table = Table(table_data, colWidths=[1*inch, 2*inch, 1.2*inch, 1.2*inch, 1*inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary_color),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.Color(0.95, 0.95, 0.95)]),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
            ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -2), 0.5, colors.lightgrey),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(table)

        # Category summary
        story.append(Spacer(1, 0.2*inch))
        story.append(Paragraph("Summary by Category", header_style))
        cat_data = [["Category", "Count", "Total"]]
        cat_summary = qs.values("category__name").annotate(
            count=Count("id"), total=Sum("amount")
        ).order_by("category__name")
        for row in cat_summary:
            cat_data.append([row["category__name"], str(row["count"]), f"${row['total']:,.2f}"])

        cat_table = Table(cat_data, colWidths=[3*inch, 1.5*inch, 2*inch])
        cat_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), primary_color),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.95, 0.95, 0.95)]),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(cat_table)

    # Footer
    story.append(Spacer(1, 0.3*inch))
    story.append(Paragraph(
        f"This document is provided for tax purposes. {church.church_name} is a tax-exempt organization.",
        ParagraphStyle("footer", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    ))

    doc.build(story)
    return buffer.getvalue()


@login_required
@require_http_methods(["GET", "POST"])
def profile_view(request):
    """Member profile update."""
    member = request.user.member
    if not member:
        return redirect("dashboard")

    error = None

    if request.method == "POST":
        first_name = request.POST.get("first_name", "").strip()
        last_name = request.POST.get("last_name", "").strip()
        phones = request.POST.get("phones", "").strip()
        address_line1 = request.POST.get("address_line1", "").strip()
        address_line2 = request.POST.get("address_line2", "").strip()
        city = request.POST.get("city", "").strip()
        state = request.POST.get("state", "").strip()
        postal_code = request.POST.get("postal_code", "").strip()
        country = request.POST.get("country", "").strip()

        if not first_name or not last_name:
            error = "First and last name are required."
        else:
            member.first_name = first_name
            member.last_name = last_name
            member.phones = phones
            member.address_line1 = address_line1
            member.address_line2 = address_line2
            member.city = city
            member.state = state
            member.postal_code = postal_code
            member.country = country

            if "profile_photo" in request.FILES:
                member.profile_photo = request.FILES["profile_photo"]

            member.save()
            # Update user name too
            request.user.first_name = first_name
            request.user.last_name = last_name
            request.user.save(update_fields=["first_name", "last_name"])

            messages.success(request, "Profile updated successfully.")
            return redirect("profile")

    return render(request, "members/profile.html", {
        "member": member,
        "error": error,
    })


# ─── Admin views ───────────────────────────────────────────────────────────────

@admin_required
def admin_dashboard_view(request):
    """Admin dashboard with stats."""
    now = timezone.now()
    total_members = Member.objects.filter(membership_status="active").count()
    pending_members = Member.objects.filter(membership_status="pending").count()
    total_ytd = Contribution.objects.filter(
        is_deleted=False, date__year=now.year
    ).aggregate(total=Sum("amount"))["total"] or 0
    total_this_month = Contribution.objects.filter(
        is_deleted=False, date__year=now.year, date__month=now.month
    ).aggregate(total=Sum("amount"))["total"] or 0
    recent_contributions = Contribution.objects.filter(
        is_deleted=False
    ).select_related("member", "category").order_by("-created_at")[:10]
    recent_audit = AuditLog.objects.select_related("user").order_by("-created_at")[:10]

    return render(request, "admin/dashboard.html", {
        "total_members": total_members,
        "pending_members": pending_members,
        "total_ytd": total_ytd,
        "total_this_month": total_this_month,
        "recent_contributions": recent_contributions,
        "recent_audit": recent_audit,
    })


@admin_required
def admin_members_view(request):
    """List all members with search and filter."""
    q = request.GET.get("q", "")
    status = request.GET.get("status", "")

    qs = Member.objects.select_related("family").order_by("last_name", "first_name")
    if q:
        qs = qs.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q))
    if status:
        qs = qs.filter(membership_status=status)

    return render(request, "admin/members/list.html", {
        "members": qs,
        "q": q,
        "filter_status": status,
        "status_choices": Member.STATUS_CHOICES,
    })


@admin_required
def admin_pending_view(request):
    """List pending member registrations."""
    pending = Member.objects.filter(membership_status="pending").order_by("created_at")
    return render(request, "admin/members/pending.html", {"pending_members": pending})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_new_member_view(request):
    """Create a new member manually."""
    error = None
    families = Family.objects.all()

    if request.method == "POST":
        first_name = request.POST.get("first_name", "").strip()
        last_name = request.POST.get("last_name", "").strip()
        email = request.POST.get("email", "").strip().lower()
        phones = request.POST.get("phones", "").strip()
        family_id = request.POST.get("family", "")
        family_role = request.POST.get("family_role", "head")
        status = request.POST.get("membership_status", "active")
        send_invite = request.POST.get("send_invite") == "on"

        if not all([first_name, last_name, email]):
            error = "First name, last name, and email are required."
        elif Member.objects.filter(email=email).exists():
            error = "A member with this email already exists."
        else:
            family = None
            if family_id:
                try:
                    family = Family.objects.get(pk=family_id)
                except Family.DoesNotExist:
                    pass

            member = Member.objects.create(
                first_name=first_name,
                last_name=last_name,
                email=email,
                phones=phones,
                family=family,
                family_role=family_role,
                membership_status=status,
            )

            # Create user account
            if not User.objects.filter(email=email).exists():
                import secrets
                temp_password = secrets.token_urlsafe(12)
                user = User.objects.create_user(
                    email=email,
                    password=temp_password,
                    first_name=first_name,
                    last_name=last_name,
                    is_active=(status == "active"),
                    member=member,
                    must_change_password=True,
                )
                if send_invite and status == "active":
                    from django.contrib.auth.tokens import default_token_generator
                    from django.utils.http import urlsafe_base64_encode
                    from django.utils.encoding import force_bytes
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    token = default_token_generator.make_token(user)
                    setup_url = request.build_absolute_uri(f"/password-reset/{uid}/{token}/")
                    from apps.communications.service import send_invite_email
                    send_invite_email(member, setup_url)

            log_action(request.user, "create", "member", member.pk, {"name": member.full_name}, request)
            messages.success(request, f"Member {member.full_name} created successfully.")
            return redirect("admin_member_detail", pk=member.pk)

    return render(request, "admin/members/form.html", {
        "error": error,
        "families": families,
        "status_choices": Member.STATUS_CHOICES,
        "role_choices": Member.ROLE_CHOICES,
        "is_new": True,
    })


@admin_required
def admin_member_detail_view(request, pk):
    """View member details."""
    member = get_object_or_404(Member, pk=pk)
    contributions = Contribution.objects.filter(
        member=member, is_deleted=False
    ).select_related("category").order_by("-date")[:20]
    total_ytd = Contribution.objects.filter(
        member=member, is_deleted=False, date__year=timezone.now().year
    ).aggregate(total=Sum("amount"))["total"] or 0
    total_all = Contribution.objects.filter(
        member=member, is_deleted=False
    ).aggregate(total=Sum("amount"))["total"] or 0
    user = None
    try:
        user = member.user
    except User.DoesNotExist:
        pass

    return render(request, "admin/members/detail.html", {
        "member": member,
        "contributions": contributions,
        "total_ytd": total_ytd,
        "total_all": total_all,
        "member_user": user,
    })


@admin_required
@require_http_methods(["GET", "POST"])
def admin_member_edit_view(request, pk):
    """Edit member details."""
    member = get_object_or_404(Member, pk=pk)
    families = Family.objects.all()
    error = None

    if request.method == "POST":
        member.first_name = request.POST.get("first_name", "").strip()
        member.last_name = request.POST.get("last_name", "").strip()
        member.phones = request.POST.get("phones", "").strip()
        member.address_line1 = request.POST.get("address_line1", "").strip()
        member.address_line2 = request.POST.get("address_line2", "").strip()
        member.city = request.POST.get("city", "").strip()
        member.state = request.POST.get("state", "").strip()
        member.postal_code = request.POST.get("postal_code", "").strip()
        member.country = request.POST.get("country", "").strip()
        member.family_role = request.POST.get("family_role", "head")
        member.notes = request.POST.get("notes", "").strip()

        family_id = request.POST.get("family", "")
        if family_id:
            try:
                member.family = Family.objects.get(pk=family_id)
            except Family.DoesNotExist:
                member.family = None
        else:
            member.family = None

        if not member.first_name or not member.last_name:
            error = "First and last name are required."
        else:
            if "profile_photo" in request.FILES:
                member.profile_photo = request.FILES["profile_photo"]
            member.save()
            log_action(request.user, "update", "member", member.pk, {"name": member.full_name}, request)
            messages.success(request, "Member updated successfully.")
            return redirect("admin_member_detail", pk=member.pk)

    return render(request, "admin/members/form.html", {
        "member": member,
        "families": families,
        "status_choices": Member.STATUS_CHOICES,
        "role_choices": Member.ROLE_CHOICES,
        "error": error,
        "is_new": False,
    })


@admin_required
@require_http_methods(["POST"])
def admin_approve_member_view(request, pk):
    """Approve a pending member."""
    member = get_object_or_404(Member, pk=pk)
    member.membership_status = "active"
    member.save()
    # Activate user account if exists
    try:
        member.user.is_active = True
        member.user.save(update_fields=["is_active"])
    except User.DoesNotExist:
        pass
    log_action(request.user, "approve", "member", member.pk, {"name": member.full_name}, request)
    from apps.communications.service import send_welcome_email
    send_welcome_email(member)
    messages.success(request, f"{member.full_name} has been approved.")
    return redirect("admin_pending")


@admin_required
@require_http_methods(["POST"])
def admin_reject_member_view(request, pk):
    """Reject a pending member."""
    member = get_object_or_404(Member, pk=pk)
    member.membership_status = "inactive"
    member.save()
    try:
        member.user.is_active = False
        member.user.save(update_fields=["is_active"])
    except User.DoesNotExist:
        pass
    log_action(request.user, "reject", "member", member.pk, {"name": member.full_name}, request)
    messages.success(request, f"{member.full_name} has been rejected.")
    return redirect("admin_pending")


@admin_required
@require_http_methods(["POST"])
def admin_deactivate_member_view(request, pk):
    """Deactivate an active member."""
    member = get_object_or_404(Member, pk=pk)
    member.membership_status = "inactive"
    member.save()
    try:
        member.user.is_active = False
        member.user.save(update_fields=["is_active"])
    except User.DoesNotExist:
        pass
    log_action(request.user, "update", "member", member.pk, {"action": "deactivated"}, request)
    messages.success(request, f"{member.full_name} has been deactivated.")
    return redirect("admin_member_detail", pk=pk)


@admin_required
def admin_families_view(request):
    """List all families."""
    families = Family.objects.prefetch_related("members").annotate(
        member_count=Count("members")
    ).order_by("family_name")
    return render(request, "admin/families/list.html", {"families": families})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_new_family_view(request):
    """Create a new family."""
    members = Member.objects.filter(membership_status="active")
    error = None

    if request.method == "POST":
        family_name = request.POST.get("family_name", "").strip()
        head_id = request.POST.get("head_member", "")

        if not family_name:
            error = "Family name is required."
        else:
            family = Family.objects.create(family_name=family_name)
            if head_id:
                try:
                    head = Member.objects.get(pk=head_id)
                    family.head_member = head
                    family.save()
                except Member.DoesNotExist:
                    pass
            log_action(request.user, "create", "family", family.pk, {"name": family_name}, request)
            messages.success(request, f"Family '{family_name}' created.")
            return redirect("admin_family_detail", pk=family.pk)

    return render(request, "admin/families/form.html", {
        "members": members,
        "error": error,
        "is_new": True,
    })


@admin_required
def admin_family_detail_view(request, pk):
    """View family details."""
    family = get_object_or_404(Family, pk=pk)
    family_members = family.members.all()
    all_members = Member.objects.filter(membership_status="active")
    return render(request, "admin/families/detail.html", {
        "family": family,
        "family_members": family_members,
        "all_members": all_members,
    })


@admin_required
@require_http_methods(["GET", "POST"])
def admin_family_edit_view(request, pk):
    """Edit family details."""
    family = get_object_or_404(Family, pk=pk)
    members = Member.objects.filter(membership_status="active")
    error = None

    if request.method == "POST":
        family_name = request.POST.get("family_name", "").strip()
        head_id = request.POST.get("head_member", "")

        if not family_name:
            error = "Family name is required."
        else:
            family.family_name = family_name
            if head_id:
                try:
                    family.head_member = Member.objects.get(pk=head_id)
                except Member.DoesNotExist:
                    family.head_member = None
            else:
                family.head_member = None
            family.save()
            log_action(request.user, "update", "family", family.pk, {"name": family_name}, request)
            messages.success(request, "Family updated.")
            return redirect("admin_family_detail", pk=pk)

    return render(request, "admin/families/form.html", {
        "family": family,
        "members": members,
        "error": error,
        "is_new": False,
    })


@admin_required
def admin_users_view(request):
    """List all user accounts."""
    users = User.objects.select_related("member").order_by("email")
    return render(request, "admin/users/list.html", {"users": users})


@admin_required
@require_http_methods(["POST"])
def admin_promote_user_view(request, pk):
    """Promote/demote user admin status."""
    if not request.user.can_manage_admins:
        messages.error(request, "You don't have permission to manage admins.")
        return redirect("admin_users")
    user = get_object_or_404(User, pk=pk)
    if user == request.user:
        messages.error(request, "You cannot change your own admin status.")
        return redirect("admin_users")
    user.is_admin = not user.is_admin
    user.save(update_fields=["is_admin"])
    action = "promote" if user.is_admin else "revoke"
    log_action(request.user, action, "user", user.pk, {"email": user.email}, request)
    messages.success(request, f"{'Promoted' if user.is_admin else 'Demoted'} {user.email}.")
    return redirect("admin_users")


@admin_required
@require_http_methods(["POST"])
def admin_toggle_user_active_view(request, pk):
    """Toggle user active status."""
    user = get_object_or_404(User, pk=pk)
    if user == request.user:
        messages.error(request, "You cannot deactivate yourself.")
        return redirect("admin_users")
    user.is_active = not user.is_active
    user.save(update_fields=["is_active"])
    log_action(request.user, "update", "user", user.pk, {"email": user.email, "active": user.is_active}, request)
    messages.success(request, f"User {'activated' if user.is_active else 'deactivated'}.")
    return redirect("admin_users")


@admin_required
@require_http_methods(["GET", "POST"])
def admin_settings_view(request):
    """Church settings management."""
    church = ChurchSettings.get()
    error = None

    if request.method == "POST":
        fields = [
            "church_name", "church_address", "church_city", "church_state",
            "church_zip", "church_country", "church_phone", "church_email",
            "church_website", "ein_tax_id", "currency", "timezone", "date_format",
            "brevo_api_key", "default_from_email", "reply_to_email",
            "thankyou_email_subject_template", "thankyou_email_intro_text",
            "email_image_url", "turnstile_site_key", "turnstile_secret_key",
            "primary_color",
        ]
        for f in fields:
            setattr(church, f, request.POST.get(f, "").strip())

        if "church_logo" in request.FILES:
            church.church_logo = request.FILES["church_logo"]

        church.save()
        log_action(request.user, "settings_change", "settings", 1, {}, request)
        messages.success(request, "Settings saved successfully.")
        return redirect("admin_settings")

    return render(request, "admin/settings/index.html", {
        "church": church,
        "error": error,
    })


@admin_required
def admin_categories_view(request):
    """List contribution categories."""
    cats = ContributionCategory.objects.all()
    return render(request, "admin/settings/categories.html", {"categories": cats})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_new_category_view(request):
    """Create a new contribution category."""
    error = None
    if request.method == "POST":
        name = request.POST.get("name", "").strip()
        description = request.POST.get("description", "").strip()
        display_order = request.POST.get("display_order", "0")
        is_active = request.POST.get("is_active") == "on"

        if not name:
            error = "Category name is required."
        else:
            cat = ContributionCategory.objects.create(
                name=name,
                description=description,
                display_order=int(display_order) if display_order.isdigit() else 0,
                is_active=is_active,
            )
            log_action(request.user, "create", "category", cat.pk, {"name": name}, request)
            messages.success(request, f"Category '{name}' created.")
            return redirect("admin_categories")

    return render(request, "admin/settings/category_form.html", {"error": error, "is_new": True})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_edit_category_view(request, pk):
    """Edit a contribution category."""
    cat = get_object_or_404(ContributionCategory, pk=pk)
    error = None

    if request.method == "POST":
        cat.name = request.POST.get("name", "").strip()
        cat.description = request.POST.get("description", "").strip()
        display_order = request.POST.get("display_order", "0")
        cat.display_order = int(display_order) if display_order.isdigit() else 0
        cat.is_active = request.POST.get("is_active") == "on"

        if not cat.name:
            error = "Category name is required."
        else:
            cat.save()
            log_action(request.user, "update", "category", cat.pk, {"name": cat.name}, request)
            messages.success(request, "Category updated.")
            return redirect("admin_categories")

    return render(request, "admin/settings/category_form.html", {
        "category": cat, "error": error, "is_new": False
    })


@admin_required
def admin_bible_verses_view(request):
    """List Bible verses."""
    verses = BibleVerse.objects.all()
    return render(request, "admin/settings/bible_verses.html", {"verses": verses})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_new_bible_verse_view(request):
    """Create a new Bible verse."""
    error = None
    if request.method == "POST":
        reference = request.POST.get("reference", "").strip()
        text = request.POST.get("text", "").strip()
        is_active = request.POST.get("is_active") == "on"

        if not reference or not text:
            error = "Reference and text are required."
        else:
            BibleVerse.objects.create(reference=reference, text=text, is_active=is_active)
            messages.success(request, f"Bible verse '{reference}' created.")
            return redirect("admin_bible_verses")

    return render(request, "admin/settings/verse_form.html", {"error": error, "is_new": True})


@admin_required
@require_http_methods(["GET", "POST"])
def admin_edit_bible_verse_view(request, pk):
    """Edit a Bible verse."""
    verse = get_object_or_404(BibleVerse, pk=pk)
    error = None

    if request.method == "POST":
        verse.reference = request.POST.get("reference", "").strip()
        verse.text = request.POST.get("text", "").strip()
        verse.is_active = request.POST.get("is_active") == "on"

        if not verse.reference or not verse.text:
            error = "Reference and text are required."
        else:
            verse.save()
            messages.success(request, "Bible verse updated.")
            return redirect("admin_bible_verses")

    return render(request, "admin/settings/verse_form.html", {
        "verse": verse, "error": error, "is_new": False
    })


@admin_required
def admin_audit_log_view(request):
    """View audit log."""
    logs = AuditLog.objects.select_related("user").order_by("-created_at")[:200]
    return render(request, "admin/audit_log.html", {"logs": logs})
