# GraceDesk — Planning & Architecture

## What GraceDesk Is

A simple church member portal + admin dashboard for tracking contributions and communicating via email. It is NOT a full church management system. No events, no attendance, no check-in, no scheduling.

**Two types of users:**
- **Church Members** — register, login, view contributions, update profile, download tax reports
- **Admins** — login, manage members, enter contributions, send thank-you emails, generate reports

**We do NOT collect money.** All donations happen outside the app (cash, check, Zelle, bank transfer, Zeffy, Stripe). GraceDesk only records what was given and sends thank-you emails.

## User Flows

### Flow 1: Member Registration
1. Visitor goes to public registration page
2. Fills form: name, email, phone, DOB (mm/dd only), family info
3. Gets a "pending approval" message
4. Admin receives notification of new registration
5. Admin reviews and approves or rejects
6. Member gets welcome email on approval
7. Member can now login

### Flow 2: Contribution Entry
1. Someone donates to the church (cash, Zelle, check, etc.)
2. Admin logs into GraceDesk
3. Admin enters contribution: member, amount, date, method, notes
4. App shows confirmation screen with all details
5. Admin reviews and clicks "Save & Send Thank You"
6. Thank-you email sent to member via Brevo
7. Email delivery logged

### Flow 3: Member Self-Service
1. Member logs in
2. Sees dashboard: total contributions this year, recent contributions
3. Can view full contribution history
4. Can download monthly or annual tax report (PDF)
5. Can update their profile (phone, email, address)

### Flow 4: Admin Member Management
1. Super Admin creates admin accounts
2. Admins can approve/reject pending registrations
3. Admins can deactivate members (not delete)
4. Admins can edit member profiles
5. Admins can view all contributions and generate reports

### Flow 5: Super Admin
1. Only Super Admin can create/deactivate admin users
2. Super Admin has all admin permissions plus user management
3. First Super Admin created during initial setup

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.x + DRF |
| Frontend | Django Templates + HTMX + Tailwind CSS |
| Database (dev) | SQLite |
| Database (prod) | PostgreSQL (Railway) |
| Email | django-anymail[brevo] |
| Background tasks | Django-Q2 |
| Password hashing | Argon2id |
| Deployment | Railway |
| License | MIT |

## Database Schema

### users
App login accounts. Separate from member profiles but linked.
```
id
email (unique, used as username)
password (Argon2id hashed)
first_name, last_name
role (super_admin | admin | member)
is_active (boolean, for deactivation)
member_id (FK to members, nullable — admins may not be members)
created_at, updated_at
```

### members
Church directory profiles. A member may or may not have a login.
```
id
family_id (FK to families)
first_name, last_name
email, phone
dob_month, dob_day (integer, mm/dd only — no year)
anniversary_month, anniversary_day (integer, mm/dd only — nullable)
address_line1, address_line2, city, state, postal_code
profile_photo
membership_status (pending | active | inactive)
family_role (head | spouse | child | other)
notes
created_at, updated_at
```

### families
Family grouping with a head.
```
id
family_name
head_member_id (FK to members)
created_at, updated_at
```

### contributions
Every recorded gift. Linked to individual member (IRS requirement).
```
id
member_id (FK to members)
amount (decimal)
date
method (cash | check | zelle | bank_transfer | zeffy | stripe | other)
notes
receipt_number (auto-generated)
entered_by (FK to users — the admin who recorded it)
created_at, updated_at
```

### email_logs
Every email sent through the system.
```
id
member_id (FK to members)
contribution_id (FK to contributions, nullable)
email_type (thank_you | welcome | report | other)
subject
recipient_email
brevo_message_id
status (queued | sent | delivered | opened | bounced | failed)
sent_at
created_at
```

### audit_logs
Who did what and when. Append-only.
```
id
user_id (FK to users)
action (create | update | delete | login | logout | approve | reject | export)
entity_type (member | contribution | user)
entity_id
details (JSON — before/after values)
ip_address
created_at
```

## Roles and Permissions

| Action | Super Admin | Admin | Member |
|--------|------------|-------|--------|
| Create admin users | Yes | No | No |
| Deactivate users | Yes | No | No |
| Approve member registrations | Yes | Yes | No |
| Enter contributions | Yes | Yes | No |
| Edit contributions | Yes | Yes | No |
| Delete contributions | Yes | No | No |
| View all members | Yes | Yes | No |
| Edit member profiles | Yes | Yes | Own only |
| View all contributions | Yes | Yes | Own only |
| Download tax reports | Yes | Yes | Own only |
| Send emails | Yes | Yes | No |
| View audit logs | Yes | No | No |

## Pages / URLs

### Public (no login)
- `/` — Landing page with church info and login/register links
- `/register/` — Member registration form
- `/login/` — Login page
- `/forgot-password/` — Password reset

### Member Pages (login required, role: member)
- `/dashboard/` — Member dashboard: year total, recent contributions
- `/contributions/` — Full contribution history with filters
- `/contributions/report/monthly/` — Download monthly PDF
- `/contributions/report/annual/` — Download annual tax report PDF
- `/profile/` — View and edit own profile

### Admin Pages (login required, role: admin or super_admin)
- `/admin/dashboard/` — Admin dashboard: pending approvals, recent activity
- `/admin/members/` — Member list with search and filters
- `/admin/members/<id>/` — Member detail with contribution history
- `/admin/members/pending/` — Pending registration approvals
- `/admin/contributions/new/` — Enter new contribution (with confirm step)
- `/admin/contributions/` — All contributions with filters
- `/admin/contributions/<id>/edit/` — Edit contribution
- `/admin/reports/` — Generate reports (monthly, annual, by member)

### Super Admin Pages (login required, role: super_admin)
- `/admin/users/` — Manage admin users
- `/admin/users/new/` — Create admin user
- `/admin/audit-log/` — View audit log

## Brevo Email Integration

### Thank-You Email (on every contribution)
- Triggered when admin clicks "Save & Send Thank You"
- Template variables: member_name, amount, date, method, church_name, receipt_number
- Reply-to: church's Google Workspace email
- Logged in email_logs table

### Welcome Email (on registration approval)
- Triggered when admin approves a pending registration
- Template variables: member_name, login_url, church_name

### Future Emails (Phase 2)
- Birthday greetings (mm/dd match)
- Anniversary greetings (mm/dd match)
- Monthly contribution summary

## Reports

### Monthly Contribution Report (PDF)
- Member name, address
- List of contributions that month (date, amount, method)
- Month total
- Church name, address, tax ID

### Annual Tax Report (PDF)
- Member name, address
- All contributions for the calendar year
- Annual total
- Church name, address, EIN/tax ID
- Statement: "No goods or services were provided in exchange for these contributions"
- Suitable for US tax filing (IRS compliant)

## Security

- Passwords: Argon2id only
- CSRF protection on all forms
- No sensitive data in URLs
- Contribution amounts visible only to admins and the contributing member
- Soft deactivation instead of hard delete for members and users
- Audit log on all data changes
- HTTPS enforced in production (Railway provides this)
- Email field encryption for sensitive fields in future phase

## UI Principles

- **Simple.** Church admins and members are not tech-savvy.
- **Mobile-friendly.** Most members will use phones.
- **Minimal clicks.** Contribution entry should be 3-4 clicks max.
- **Confirmation before action.** Always show a confirm screen before saving contributions or sending emails.
- **Clear labels.** No jargon. "Contribution" not "Donation Record." "Download Tax Report" not "Export Annual PDF."
- **Clean dashboard.** Only show what matters: pending items for admins, totals for members.

## Django Apps Structure

```
apps/
  accounts/         # User model, login, logout, registration, password reset
  members/          # Member profiles, families, approval workflow
  contributions/    # Contribution entry, history, reports
  communications/   # Brevo email sending, templates, email logs
  core/             # Landing page, dashboard routing, church settings
```

## Feature Roadmap

### Phase 1: MVP
- [ ] Landing page with login/register links
- [ ] Member registration form with pending approval
- [ ] Login/logout/password reset
- [ ] Admin: approve/reject pending members
- [ ] Admin: member list with search
- [ ] Admin: enter contribution with confirmation screen
- [ ] Admin: edit/delete contribution
- [ ] Member: dashboard with year total and recent contributions
- [ ] Member: full contribution history
- [ ] Member: update own profile
- [ ] Thank-you email via Brevo on each contribution
- [ ] Welcome email on approval
- [ ] Annual tax report PDF download
- [ ] Monthly report PDF download
- [ ] Super Admin: create/deactivate admin users
- [ ] Audit logging
- [ ] Responsive Tailwind CSS design
- [ ] Deploy to Railway

### Phase 2: Communication & Polish
- [ ] Birthday email (mm/dd match, daily cron)
- [ ] Anniversary email (mm/dd match, daily cron)
- [ ] Monthly contribution summary email
- [ ] Email delivery tracking (opens, bounces)
- [ ] Bulk contribution entry (Sunday batch)
- [ ] Family contribution summary view
- [ ] Admin dashboard charts (monthly totals)
- [ ] CSV export for contributions
- [ ] CSV import for bulk member upload
