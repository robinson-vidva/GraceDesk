"""
Email service for GraceDesk.
Handles sending all transactional emails via Brevo (anymail) or console backend.
"""
import logging
import random
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger(__name__)


def _get_email_backend_settings():
    """Configure email backend dynamically based on ChurchSettings Brevo key."""
    from apps.core.models import ChurchSettings
    church = ChurchSettings.get()
    if church.brevo_api_key:
        return church.brevo_api_key, church.default_from_email or "noreply@gracedesk.org"
    return None, church.default_from_email or "noreply@gracedesk.org"


def _get_random_verse():
    """Get a random active Bible verse."""
    from apps.communications.models import BibleVerse
    verses = list(BibleVerse.objects.filter(is_active=True))
    if verses:
        return random.choice(verses)
    return None


def _log_email(member, contribution, email_type, subject, recipient_email, verse_text="", error="", brevo_id=""):
    """Create an EmailLog entry."""
    from apps.communications.models import EmailLog
    status = "failed" if error else "sent"
    EmailLog.objects.create(
        member=member,
        contribution=contribution,
        email_type=email_type,
        subject=subject,
        recipient_email=recipient_email,
        brevo_message_id=brevo_id,
        bible_verse_used=verse_text,
        status=status,
        error_message=error,
        sent_at=timezone.now() if not error else None,
    )


def _send_email(subject, html_body, text_body, recipient_email, from_email, reply_to=None, brevo_api_key=None):
    """Send an email using configured backend."""
    from django.conf import settings as django_settings

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=from_email,
        to=[recipient_email],
        reply_to=[reply_to] if reply_to else None,
    )
    msg.attach_alternative(html_body, "text/html")

    # If a Brevo API key is provided and anymail is installed, override the connection
    if brevo_api_key:
        try:
            from anymail.backends.brevo import EmailBackend as BrevoBackend
            from django.test.utils import override_settings
            connection = BrevoBackend(api_key=brevo_api_key)
            msg.connection = connection
        except ImportError:
            pass

    msg.send(fail_silently=False)
    return ""


def send_thank_you_email(contribution):
    """Send a thank you email after a contribution is recorded."""
    from apps.core.models import ChurchSettings

    church = ChurchSettings.get()
    member = contribution.member
    verse = _get_random_verse()
    verse_text = f'"{verse.text}" — {verse.reference}' if verse else ""
    brevo_key, from_email = _get_email_backend_settings()
    reply_to = church.reply_to_email or church.default_from_email

    subject_template = church.thankyou_email_subject_template or "{church_name} — Thank you for your generous contribution"
    subject = subject_template.replace("{church_name}", church.church_name)
    intro = church.thankyou_email_intro_text or "We are grateful for your generous contribution to our church."

    amount_str = f"${contribution.amount:,.2f}" if church.currency == "USD" else f"{church.currency} {contribution.amount:,.2f}"
    date_str = contribution.date.strftime("%B %d, %Y")

    html_body = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: {church.primary_color}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">{church.church_name}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: {church.primary_color};">Thank You, {member.first_name}!</h2>
    <p>{intro}</p>
    <div style="background: white; border-left: 4px solid {church.primary_color}; padding: 15px; margin: 20px 0; border-radius: 0 4px 4px 0;">
      <p style="margin: 0;"><strong>Receipt Number:</strong> {contribution.receipt_number}</p>
      <p style="margin: 8px 0 0;"><strong>Amount:</strong> {amount_str}</p>
      <p style="margin: 8px 0 0;"><strong>Category:</strong> {contribution.category.name}</p>
      <p style="margin: 8px 0 0;"><strong>Date:</strong> {date_str}</p>
      <p style="margin: 8px 0 0;"><strong>Method:</strong> {contribution.get_method_display()}</p>
    </div>
    {f'<blockquote style="border-left: 3px solid #ccc; padding-left: 15px; color: #666; font-style: italic;">{verse_text}</blockquote>' if verse_text else ''}
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
      This email serves as your contribution receipt. Please retain it for your records.
      {f'<br>Tax ID (EIN): {church.ein_tax_id}' if church.ein_tax_id else ''}
    </p>
    <p style="color: #999; font-size: 12px;">{church.church_name} &bull; {church.church_address}, {church.church_city}, {church.church_state} {church.church_zip}</p>
  </div>
</body>
</html>
"""
    text_body = f"""Thank You, {member.first_name}!

{intro}

Receipt Number: {contribution.receipt_number}
Amount: {amount_str}
Category: {contribution.category.name}
Date: {date_str}
Method: {contribution.get_method_display()}

{verse_text}

{church.church_name}
{church.church_address}, {church.church_city}, {church.church_state} {church.church_zip}
"""

    error = ""
    brevo_id = ""
    try:
        _send_email(subject, html_body, text_body, member.email, from_email, reply_to, brevo_key)
    except Exception as e:
        error = str(e)
        logger.error(f"Failed to send thank you email to {member.email}: {e}")

    _log_email(member, contribution, "thank_you", subject, member.email, verse_text, error, brevo_id)


def send_welcome_email(member):
    """Send a welcome email when a member is approved."""
    from apps.core.models import ChurchSettings

    church = ChurchSettings.get()
    brevo_key, from_email = _get_email_backend_settings()
    reply_to = church.reply_to_email or church.default_from_email
    subject = f"Welcome to {church.church_name}!"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: {church.primary_color}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">{church.church_name}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2 style="color: {church.primary_color};">Welcome, {member.first_name}!</h2>
    <p>Your membership has been approved. You can now log in to view your contributions and download reports.</p>
    <p>Login at: <a href="/login/" style="color: {church.primary_color};">/login/</a></p>
    <p>God bless you!</p>
    <p style="color: #999; font-size: 12px;">{church.church_name}</p>
  </div>
</body>
</html>
"""
    text_body = f"""Welcome, {member.first_name}!

Your membership at {church.church_name} has been approved.
You can now log in to view your contributions and download reports.

Login at: /login/

God bless you!
{church.church_name}
"""

    error = ""
    try:
        _send_email(subject, html_body, text_body, member.email, from_email, reply_to, brevo_key)
    except Exception as e:
        error = str(e)
        logger.error(f"Failed to send welcome email to {member.email}: {e}")

    _log_email(member, None, "welcome", subject, member.email, "", error)


def send_password_reset_email(user, reset_url):
    """Send a password reset email."""
    from apps.core.models import ChurchSettings

    church = ChurchSettings.get()
    brevo_key, from_email = _get_email_backend_settings()
    subject = f"{church.church_name} — Password Reset"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: {church.primary_color}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">{church.church_name}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2>Password Reset Request</h2>
    <p>We received a request to reset your password. Click the link below to set a new password:</p>
    <p><a href="{reset_url}" style="background: {church.primary_color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a></p>
    <p style="color: #666;">This link will expire in 24 hours. If you did not request a password reset, please ignore this email.</p>
    <p style="color: #999; font-size: 12px;">{church.church_name}</p>
  </div>
</body>
</html>
"""
    text_body = f"""Password Reset Request

We received a request to reset your password for {church.church_name}.

Click this link to reset your password:
{reset_url}

This link will expire in 24 hours. If you did not request a password reset, please ignore this email.

{church.church_name}
"""

    member = getattr(user, "member", None)
    error = ""
    try:
        _send_email(subject, html_body, text_body, user.email, from_email, None, brevo_key)
    except Exception as e:
        error = str(e)
        logger.error(f"Failed to send password reset email to {user.email}: {e}")

    _log_email(member, None, "password_reset", subject, user.email, "", error)


def send_invite_email(member, setup_url):
    """Send an invite email to a manually created member."""
    from apps.core.models import ChurchSettings

    church = ChurchSettings.get()
    brevo_key, from_email = _get_email_backend_settings()
    subject = f"You've been invited to {church.church_name} Member Portal"

    html_body = f"""
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: {church.primary_color}; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">{church.church_name}</h1>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
    <h2>Welcome, {member.first_name}!</h2>
    <p>You have been invited to access the {church.church_name} member portal where you can view your contributions and download reports.</p>
    <p>Click the link below to set up your account:</p>
    <p><a href="{setup_url}" style="background: {church.primary_color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Set Up My Account</a></p>
    <p style="color: #666;">This link will expire in 7 days.</p>
    <p>God bless you!</p>
    <p style="color: #999; font-size: 12px;">{church.church_name}</p>
  </div>
</body>
</html>
"""
    text_body = f"""Welcome, {member.first_name}!

You have been invited to access the {church.church_name} member portal.

Click this link to set up your account:
{setup_url}

This link will expire in 7 days.

{church.church_name}
"""

    error = ""
    try:
        _send_email(subject, html_body, text_body, member.email, from_email, None, brevo_key)
    except Exception as e:
        error = str(e)
        logger.error(f"Failed to send invite email to {member.email}: {e}")

    _log_email(member, None, "invite", subject, member.email, "", error)
