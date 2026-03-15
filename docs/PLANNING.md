# GraceDesk — Planning & Architecture

## Overview

GraceDesk is an open-source church management system. Initial client: Jesus Family Ministry (JFM). Core need: manage church members, record tithes/donations, and send automated emails (thank-you receipts, newsletters) via Brevo API.

## Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Framework | Django 5.x + DRF | Built-in admin, ORM, auth, migrations |
| Frontend | Django Templates + HTMX + Tailwind CSS | No JS build pipeline, SPA-like UX |
| Database (dev) | SQLite | Zero config |
| Database (prod) | PostgreSQL | Railway provides managed PostgreSQL |
| Email | django-anymail[brevo] | ESP-agnostic Brevo integration |
| Background tasks | Django-Q2 | Uses DB as broker, no Redis needed |
| Auth | Django built-in + Argon2id | OWASP recommended password hashing |
| Deployment | Railway | $5/month, push-to-deploy from GitHub |
| License | MIT | Maximum adoption |

## Database Schema

### Key Rule: Donations link to individuals, not families
The IRS requires individual-based donation tracking for tax receipts.

### Tables

**tenants** — Future multi-church support. Every table has `tenant_id`.
```
id, name, slug, timezone, currency,
brevo_api_key (encrypted), reply_to_email,
created_at, updated_at
```

**members**
```
id, tenant_id, household_id,
first_name, middle_name, last_name,
email, phone,
date_of_birth (encrypted), gender, marital_status,
profile_photo, membership_date,
membership_status (active | inactive | visitor | pending | transferred | deceased),
household_role (head | spouse | child | other),
pastoral_notes (encrypted),
created_at, updated_at, deleted_at
```

**households**
```
id, tenant_id,
family_name,
address_line1, address_line2, city, state, postal_code, country,
home_phone,
created_at, updated_at
```

**donations**
```
id, tenant_id, member_id (nullable for anonymous),
batch_id (nullable),
amount (encrypted), currency, date,
type (tithe | offering | building_fund | missions | special | other),
fund_id,
payment_method (cash | check | bank_transfer | mobile | credit_card | online),
fiscal_year, receipt_number, is_anonymous, notes,
created_at, updated_at
```

**donation_batches**
```
id, tenant_id,
batch_date, description,
expected_total, actual_total,
status (open | closed | reconciled),
created_by, closed_by,
created_at, updated_at
```

**pledges**
```
id, tenant_id, member_id,
amount, frequency (weekly | biweekly | monthly | quarterly | annually),
start_date, end_date, fiscal_year,
status (active | completed | cancelled),
created_at, updated_at
```

**email_logs**
```
id, tenant_id, member_id,
campaign_id (nullable),
brevo_message_id, template_name,
subject, recipient_email,
status (queued | sent | delivered | opened | clicked | bounced | failed | unsubscribed),
bounce_type, bounce_reason,
sent_at, delivered_at, opened_at, clicked_at,
created_at
```

**email_campaigns**
```
id, tenant_id,
name, subject, template_id,
target_segment, total_recipients,
delivered, opened, clicked, bounced,
scheduled_at, sent_at,
created_by, created_at
```

**email_consent**
```
id, tenant_id, member_id,
communication_type (newsletter | donation_receipt | event | pastoral),
consented (boolean), consent_source, ip_address,
consented_at, withdrawn_at
```

**audit_logs**
```
id, tenant_id, user_id,
action (create | read | update | delete | export | login | logout),
entity_type, entity_id,
before_value (JSON), after_value (JSON),
ip_address, user_agent,
created_at
```

## Role-Based Access Control

Users (app login) are separate from Members (church directory). Not all members are users.

| Permission | Super Admin | Church Admin | Finance | Secretary | Member |
|-----------|------------|-------------|---------|-----------|--------|
| View all members | Yes | Yes | No | Yes | Own only |
| Edit members | Yes | Yes | No | Yes | Own only |
| View donation amounts | Yes | No | Yes | No | Own only |
| Create donations | Yes | Yes | Yes | No | No |
| Export data | Yes | Yes | Yes | No | No |
| Send emails | Yes | Yes | No | Yes | No |
| Manage settings/users | Yes | Yes | No | No | No |

## Brevo Email Integration

- **Transactional emails:** django-anymail sends via Brevo API. Django's `send_mail()` works normally.
- **Templates:** Brevo-hosted templates with `{{params.variableName}}` for dynamic data.
- **Webhooks:** Brevo pushes delivery events (delivered, opened, bounced) to `/api/v1/webhooks/brevo/`.
- **Reply routing:** Every email sets `replyTo` to church's Google Workspace address.
- **Free tier:** 300 emails/day, 100K contacts, no credit card.
- **Consent:** All bulk emails require opt-in tracked in `email_consent` table.

## Security

- **Passwords:** Argon2id only. No SHA256, no MD5.
- **Field encryption:** AES-256-GCM for date_of_birth, donation amounts, pastoral notes.
- **Encryption key:** `.env` file (gitignored). Never in code.
- **CSRF/XSS:** Django's built-in protections. No `|safe` filter on user content.
- **Audit logging:** All data access/changes logged. Append-only table.
- **Soft delete:** Members use `deleted_at` timestamp, not hard delete.
- **Data retention:** Donation records 7 years minimum (IRS). Member profiles anonymize on request.

## Django Apps Structure

```
apps/
  core/              # Dashboard, church settings, tenant config
    models.py        # Tenant, ChurchSettings
    views.py         # Dashboard, settings views

  accounts/          # Auth, user management
    models.py        # User (extends AbstractUser), Role
    views.py         # Login, logout, password reset

  members/           # Member profiles and households
    models.py        # Member, Household
    views.py         # Member list, detail, create, edit
    api.py           # DRF viewsets

  donations/         # Financial tracking
    models.py        # Donation, DonationBatch, Pledge, Fund
    views.py         # Donation entry, history, receipts
    api.py           # DRF viewsets

  communications/    # Email system
    models.py        # EmailLog, EmailCampaign, EmailConsent, EmailTemplate
    views.py         # Campaign create, template editor, logs
    services.py      # Brevo API wrapper, webhook handler
    api.py           # DRF viewsets + webhook endpoint
```

## Feature Roadmap

### Phase 1: MVP (Months 1-3)
- [ ] Django project scaffold with settings split (base/dev/prod)
- [ ] Tenant and church settings models
- [ ] User auth with Argon2id, login/logout, password reset
- [ ] Member CRUD with HTMX list/detail/edit views
- [ ] Household management with member linking
- [ ] Donation recording (manual entry, per-member history)
- [ ] Simple PDF receipt generation
- [ ] Batch donation entry for Sunday deposits
- [ ] Brevo integration: send individual + bulk emails
- [ ] Two email templates: welcome + donation receipt
- [ ] Delivery tracking via Brevo webhooks
- [ ] Dashboard: member count, recent donations, quick actions
- [ ] Three roles: Admin, Staff, Viewer
- [ ] Tailwind CSS responsive layout
- [ ] Deploy to Railway

### Phase 2: Broader Adoption (Months 4-8)
- [ ] Reporting: donation summaries, member growth, giving trends (Chart.js)
- [ ] PDF/CSV export for all data
- [ ] Rich email template editor
- [ ] Campaign scheduling and segmentation
- [ ] CSV import with field-mapping wizard
- [ ] ChurchCRM migration tool
- [ ] Groups/ministries management
- [ ] Basic attendance tracking
- [ ] Audit log UI
- [ ] Backup/restore
- [ ] REST API documentation (drf-spectacular)
- [ ] PWA: manifest.json, service worker, offline member directory

### Phase 3: Advanced (Months 9-18)
- [ ] Multi-tenant support
- [ ] Event/calendar management
- [ ] Child check-in with guardian matching
- [ ] SMS via Brevo or Twilio
- [ ] Online giving via Stripe (optional module)
- [ ] Automated workflows (rule-based triggers)
- [ ] Plugin/extension architecture
