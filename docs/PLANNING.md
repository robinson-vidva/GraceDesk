# GraceDesk — Planning & Architecture

## What GraceDesk Is

A standalone, self-hosted, open-source church contribution tracker and member portal. Churches install their own instance, customize it with their branding, and use it to track member contributions and communicate via email.

GraceDesk does NOT collect money. All donations happen outside the app (cash, check, Zelle, etc.). GraceDesk only records what was given and sends thank-you emails.

**Product name:** GraceDesk (shown as "Powered by GraceDesk" in footer only)
**Church branding:** Church name, logo, and colors shown prominently in header/banner
**Demo instance:** gracedesk.askdevotions.com

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.x |
| Frontend | Django Templates + HTMX + Tailwind CSS |
| Database (dev) | SQLite |
| Database (prod) | PostgreSQL (Railway) |
| Email | Brevo API via django-anymail |
| Background tasks | Django-Q2 (DB-backed) |
| Bot protection | Cloudflare Turnstile |
| Password hashing | Argon2id |
| Deployment | Railway |
| License | MIT |

---

## Two User Roles

### Member
A church member who registered and was approved by admin. Can view own contributions, download reports, update profile. Family heads can also see contributions of their family members.

### Admin
A member with additional privileges. Can manage members, enter contributions, generate reports, configure church settings. One default admin account is created during setup with forced password change on first login.

There is no separate "Super Admin" role label. Instead, the first admin (created during setup) has a `can_manage_admins` flag. This admin can promote other members to admin or revoke admin access.

---

## Pages and User Flows

### Public Pages (no login required)

**Home Page `/`**
- Header/banner: church logo + church name (from settings)
- Brief description of what this tool does (3-4 bullet points)
- "Login" button
- "New to the church? Register here" section with link
- "Forgot password?" link
- Footer: contact email, phone (from settings), terms & conditions link, privacy note about personal data collection, "Powered by GraceDesk"

**Registration `/register/`**
- Cloudflare Turnstile verification
- Required fields: first name, last name, email, password, confirm password
- Optional fields: phone
- On submit: creates member (status=pending) and user (is_active=False)
- Shows message: "Thank you for registering. An admin will review and approve your account. You'll receive an email when approved."
- Admin gets notification (visible on admin dashboard)

**Login `/login/`**
- Cloudflare Turnstile verification
- Email + password
- Progressive lockout: 5 failed attempts = lock 15 min, next = 30 min, then 1 hour, then 24 hours
- First-login detection for default admin: force password change

**Forgot Password `/forgot-password/`**
- Email input
- Sends password reset link via Brevo
- Link expires in 24 hours

**Terms & Conditions `/terms/`**
- Generic terms with church name placeholder (from settings)
- Covers: personal data collection, data usage, no financial transactions, data retention

### Member Pages (login required)

**Member Dashboard `/dashboard/`**
- Welcome message with member name
- Card: total contributions this year
- Card: total contributions this month
- Recent contributions list (last 5)
- Quick links: view all contributions, download annual report, edit profile

**My Contributions `/contributions/`**
- Table: date, amount, method, category, receipt number
- Filters: date range, method, category
- Family heads see a toggle: "My contributions" / "Family contributions"
- Family view shows contributions of all family members with member name column

**Download Reports `/contributions/reports/`**
- Select: monthly or annual
- Select: month/year
- Click download: generates PDF on demand, caches it
- Cache invalidated when new contribution added for that member/period

**Monthly Report PDF**
- Church name, address, EIN/tax ID (from settings)
- Member name, address
- Table: date, amount, method, category, receipt number
- Month total

**Annual Tax Report PDF**
- Church name, address, EIN/tax ID (from settings)
- Member name, address
- Table: date, amount, method, category, receipt number
- Annual total
- Statement: "No goods or services were provided in exchange for these contributions"
- Suitable for US tax filing

**My Profile `/profile/`**
- View and edit: first name, middle name, last name, email, phone (multiple phones supported as comma-separated or add/remove), address (line1, line2, city, state, zip)
- View and edit: DOB (month/day only, no year), anniversary (month/day only, no year, nullable)
- View: family members (name, relationship, DOB) — read-only, admin manages family grouping
- Change password section
- Profile photo upload

### Admin Pages (login required, admin only)

**Admin Dashboard `/admin-panel/`**
- Count: pending member approvals (with link)
- Count: contributions entered today / this week / this month
- Recent activity log (last 10 actions)
- Quick links: enter contribution, view members, generate report

**Member Management `/admin-panel/members/`**
- Searchable, filterable list of all members
- Columns: name, email, phone, family, status, joined date
- Filters: status (active/pending/inactive), family
- Click member: view full profile with contribution history
- Actions: approve (if pending), deactivate, edit profile (except password)

**Pending Approvals `/admin-panel/members/pending/`**
- List of members with status=pending
- For each: name, email, registration date
- Actions: approve (sets active, sends welcome email) or reject (sets inactive)

**Create Member Manually `/admin-panel/members/new/`**
- Admin fills: first name, last name, email (required), phone, family assignment
- Creates member with status=active and optionally creates a user account (sends invite email with password setup link)

**Family Management `/admin-panel/families/`**
- List of families with head member and member count
- Create family: set family name, assign head member
- Add/remove members from family
- Set relationships (spouse, child, parent, sibling, other)

**Enter Contribution `/admin-panel/contributions/new/`**
- Step 1 — Fill form:
  - Member: searchable dropdown (type-ahead). If member not found, show "Add new member" inline link that opens a minimal form (first name, last name, email) and creates the member immediately, then selects them
  - Amount: decimal input, currency label from settings (default USD)
  - Date: date picker (defaults to today)
  - Method: dropdown (cash, check, zelle, bank_transfer, zeffy, stripe, paypal, other)
  - Category: dropdown (populated from church-defined categories in settings, e.g., Sunday offering, monthly tithe, special offering, building fund)
  - Notes: optional text
- Step 2 — Confirm:
  - Shows all entered details in a clear summary
  - "Edit" button to go back
  - "Save & Send Thank You" button
- Step 3 — Done:
  - Contribution saved with auto-generated receipt number (format: YYYY-NNN, e.g., 2026-001)
  - Thank-you email queued via Brevo
  - Shows success message with receipt number
  - "Enter another" button

**Contribution Management `/admin-panel/contributions/`**
- Searchable, filterable list of all contributions
- Columns: date, member name, amount, method, category, receipt number, entered by
- Filters: date range, method, category, member
- Click: view details with edit/delete options
- Edit: same form as entry, with confirm step
- Delete: soft delete with confirmation dialog and reason

**Reports `/admin-panel/reports/`**
- Generate report for specific member (monthly or annual PDF)
- Dashboard visualizations:
  - Total contributions by month (bar chart)
  - Contributions by category (pie chart)
  - Contributions by method (pie chart)
  - Comparison: this month vs last month, this year vs last year
- CSV export: all contributions with filters

**User Management `/admin-panel/users/`** (only admins with can_manage_admins flag)
- List of all users with role, status, last login
- Promote member to admin / revoke admin access
- Deactivate/reactivate user accounts
- Cannot delete users, only deactivate

**Admin Settings `/admin-panel/settings/`**

*Church Customization:*
- Church name
- Church logo (upload)
- Primary color (hex, for header/buttons)
- Church address
- Church phone
- Church email (used as reply-to for emails)
- Church website URL
- EIN / Tax ID (for tax reports)

*Regional:*
- Currency (USD default, selectable)
- Timezone
- Date format preference

*Contribution Categories:*
- Add / edit / deactivate categories
- Default categories pre-loaded: Sunday Offering, Monthly Tithe, Special Offering, Building Fund, Missions, Other

*Email Configuration:*
- Brevo API key (encrypted, stored in DB not env var so admin can update without redeploy)
- Default from email address
- Reply-to email address
- Thank-you email: subject line template, body intro text
- Bible verse rotation: admin can add multiple Bible verses (reference + text), system picks one randomly for each thank-you email
- Optional: image URL to include in thank-you email (e.g., church banner)

*Security:*
- Cloudflare Turnstile site key and secret key

**Audit Log `/admin-panel/audit-log/`**
- Append-only log of all significant actions
- Columns: timestamp, user, action, entity, details
- Filters: date range, user, action type
- Actions logged: login, logout, member approval/rejection, contribution create/edit/delete, profile update, admin promotion/revocation, settings change, report generation, data export

---

## Database Schema

### church_settings
One row per installation. Stores all church customization.
```
id
church_name, church_logo, primary_color
church_address, church_city, church_state, church_zip, church_country
church_phone, church_email, church_website
ein_tax_id
currency (default: USD)
timezone (default: America/New_York)
date_format (default: MM/DD/YYYY)
brevo_api_key (encrypted)
default_from_email, reply_to_email
thankyou_email_subject_template
thankyou_email_intro_text
email_image_url
turnstile_site_key, turnstile_secret_key
created_at, updated_at
```

### bible_verses
Admin-managed verses for email rotation.
```
id
reference (e.g., "2 Corinthians 9:7")
text (e.g., "Each of you should give what you have decided...")
is_active (boolean)
created_at
```

### users
Login accounts. Email is the username.
```
id
email (unique)
password (Argon2id)
first_name, last_name
is_admin (boolean, default False)
can_manage_admins (boolean, default False — only first admin)
is_active (boolean, default False until approved)
must_change_password (boolean, default False — True for default admin)
member_id (FK to members, nullable)
failed_login_attempts (integer, default 0)
locked_until (datetime, nullable)
last_login
created_at, updated_at
```

### members
Church directory profiles.
```
id
family_id (FK to families, nullable)
first_name, middle_name, last_name
email (unique)
phones (text, comma-separated or JSON array)
dob_month, dob_day (integers 1-12 and 1-31, nullable)
anniversary_month, anniversary_day (integers, nullable)
address_line1, address_line2, city, state, postal_code, country
profile_photo
membership_status (pending | active | inactive)
family_role (head | spouse | child | parent | sibling | other)
notes (admin only)
created_at, updated_at
```

### families
```
id
family_name
head_member_id (FK to members)
created_at, updated_at
```

### family_relationships
Tracks relationship between family members.
```
id
family_id (FK to families)
member_id (FK to members)
relationship_to_head (spouse | child | parent | sibling | other)
created_at
```

### contribution_categories
Church-defined categories.
```
id
name (e.g., "Sunday Offering", "Monthly Tithe")
description
is_active (boolean)
display_order (integer)
created_at, updated_at
```

### contributions
```
id
member_id (FK to members)
category_id (FK to contribution_categories)
amount (decimal 10,2)
currency (from settings, stored per record for historical accuracy)
date
method (cash | check | zelle | bank_transfer | zeffy | stripe | paypal | other)
receipt_number (auto: YYYY-NNN, sequential per year)
notes
entered_by_id (FK to users)
is_deleted (boolean, default False)
deleted_reason
deleted_by_id (FK to users, nullable)
deleted_at (nullable)
created_at, updated_at
```

### email_logs
```
id
member_id (FK to members)
contribution_id (FK to contributions, nullable)
email_type (thank_you | welcome | password_reset | invite | report)
subject
recipient_email
brevo_message_id
bible_verse_used (text, nullable)
status (queued | sent | delivered | opened | bounced | failed)
error_message (nullable)
sent_at
created_at
```

### report_cache
Cached generated PDFs.
```
id
member_id (FK to members)
report_type (monthly | annual)
period_year (integer)
period_month (integer, nullable — null for annual)
file_path
generated_at
is_valid (boolean — set False when new contribution added)
```

### audit_logs
Append-only.
```
id
user_id (FK to users)
action (login | logout | create | update | delete | approve | reject | promote | revoke | export | settings_change)
entity_type (member | contribution | user | family | settings | category)
entity_id (nullable)
details (JSON)
ip_address
user_agent
created_at
```

### login_attempts
Track failed logins for lockout.
```
id
email
ip_address
attempted_at
successful (boolean)
```

---

## Email Templates

### Thank-You Email
Sent immediately when admin saves a contribution.
```
Subject: [church_name] — Thank you for your generous contribution
Body:
  - Church logo/image (from settings)
  - "Dear [member_name],"
  - [thankyou_email_intro_text from settings]
  - Contribution details: amount, date, method, category, receipt number
  - Random Bible verse (from bible_verses table)
  - Church contact info
  - Reply-to: church email from settings
```

### Welcome Email
Sent when admin approves a pending registration.
```
Subject: Welcome to [church_name]!
Body:
  - Church logo
  - "Dear [member_name],"
  - "Your registration has been approved. You can now login at [login_url]."
  - Church contact info
```

### Password Reset Email
```
Subject: Reset your password — [church_name]
Body:
  - Reset link (expires 24 hours)
  - "If you didn't request this, ignore this email."
```

### Account Invite Email
Sent when admin creates a member manually with user account.
```
Subject: You've been added to [church_name] on GraceDesk
Body:
  - "Dear [member_name],"
  - "An account has been created for you. Click below to set your password."
  - Set password link
```

---

## Django Apps Structure

```
apps/
  accounts/        # User model, login, logout, registration, password reset,
                   # Turnstile verification, lockout logic, user management
  members/         # Member profiles, families, family relationships,
                   # approval workflow, admin member management
  contributions/   # Contribution entry (with confirm step), history,
                   # categories, edit/delete, reports (PDF), dashboard charts
  communications/  # Brevo email service, email logs, email templates,
                   # Bible verse management
  core/            # Landing page, church settings model and admin UI,
                   # terms & conditions page, base templates, audit logging
```

---

## Initial Setup Flow

When GraceDesk is first deployed:
1. `python manage.py migrate` creates all tables
2. `python manage.py setup_gracedesk` custom command:
   - Creates default ChurchSettings row with placeholder values
   - Creates default contribution categories
   - Creates default admin user (email: admin@gracedesk.local, password: changeme123) with must_change_password=True and can_manage_admins=True
   - Prints instructions to login and change password
3. Admin logs in, is forced to change password
4. Admin goes to Settings to configure church name, logo, Brevo API key, etc.
5. GraceDesk is ready for use

---

## Security

- Email-based login only (no usernames)
- Argon2id password hashing
- Cloudflare Turnstile on login and registration
- Progressive account lockout (5 attempts: 15min, 30min, 1hr, 24hr)
- CSRF protection on all forms
- Contribution amounts visible only to admins and the contributing member (family heads see family)
- Soft deactivation instead of hard delete for members and users
- Soft delete for contributions with reason tracking
- Audit log on all significant actions
- Activity logging to detect data theft patterns
- HTTPS enforced in production (Railway provides this)
- Brevo API key stored encrypted in DB
- No sensitive data in URLs
- Report cache invalidation on data change

---

## UI Design Principles

1. **Dead simple.** Church admins and members are not tech-savvy. If it needs explanation, redesign it.
2. **Mobile-first.** Most members use phones. Everything must work on a 375px screen.
3. **Minimal clicks.** Contribution entry: 4 clicks max (fill, confirm, save, done).
4. **Confirm before action.** Always show confirmation before saving contributions, approving members, or sending emails.
5. **Clear labels.** "Contribution" not "Donation Record." "Download Tax Report" not "Generate Annual Contribution Statement PDF."
6. **Church branding first.** Church name and logo prominent. "Powered by GraceDesk" in footer only.
7. **Helpful empty states.** When there are no contributions yet, show a friendly message, not a blank table.
8. **Success feedback.** Always show clear success/error messages after actions.

---

## Feature Roadmap

### Phase 1: MVP
- [ ] Church settings model and admin configuration page
- [ ] Custom setup management command with default admin
- [ ] Landing page with church branding
- [ ] Cloudflare Turnstile integration
- [ ] Member registration with pending approval
- [ ] Email + password login with progressive lockout
- [ ] Forced password change for default admin
- [ ] Password reset via email
- [ ] Admin: approve/reject pending members (sends welcome email)
- [ ] Admin: create member manually (with optional invite email)
- [ ] Admin: member list with search and filters
- [ ] Admin: edit member profiles
- [ ] Admin: deactivate members
- [ ] Family management (create family, assign members, set relationships)
- [ ] Contribution categories (CRUD, default set pre-loaded)
- [ ] Admin: enter contribution with confirm step and auto thank-you email
- [ ] Admin: edit/delete (soft) contributions
- [ ] Admin: contribution list with filters
- [ ] Receipt numbers: YYYY-NNN sequential per year
- [ ] Member: dashboard with year/month totals and recent contributions
- [ ] Member: contribution history with filters
- [ ] Member: family head sees family contributions
- [ ] Member: update own profile
- [ ] Monthly and annual PDF reports (generated on demand, cached)
- [ ] Bible verse management (CRUD) and random selection for emails
- [ ] Email logs with delivery status
- [ ] Audit logging
- [ ] Activity logging for security
- [ ] Terms and conditions page
- [ ] Responsive Tailwind CSS design (mobile-first)
- [ ] Deploy to Railway
- [ ] User management (admin promotion/revocation, deactivation)

### Phase 2: Polish & Communication
- [ ] Birthday email (daily cron, mm/dd match)
- [ ] Anniversary email (daily cron, mm/dd match)
- [ ] Monthly contribution summary email
- [ ] Admin dashboard charts (contributions by month, category, method)
- [ ] Bulk contribution entry (Sunday batch)
- [ ] CSV export for contributions
- [ ] CSV import for bulk member upload
- [ ] Email delivery tracking (opens, bounces via Brevo webhooks)
- [ ] Customizable email image/banner in settings
- [ ] Year-over-year comparison dashboard
