# GraceDesk

An open-source church management system for member profiles, tithe tracking, and email communication.

Built for churches that can't afford $70-120/month for Tithe.ly, Breeze, or Planning Center.

## What It Does

- **Member Management** — Profiles, households, membership status, pastoral notes
- **Tithe & Donation Tracking** — Record gifts, generate receipts, fiscal year summaries
- **Email Communication** — Automated thank-you emails, newsletters, and campaigns via Brevo API
- **Role-Based Access** — Admin, Staff, Finance, Secretary, Member roles with granular permissions

## Tech Stack

- **Backend:** Django 5.x + Django REST Framework
- **Frontend:** Django Templates + HTMX + Tailwind CSS
- **Database:** SQLite (dev) / PostgreSQL (production)
- **Email:** Brevo API via django-anymail
- **Deployment:** Railway

## Local Development

```bash
git clone https://github.com/robinson-vidva/GraceDesk.git
cd GraceDesk
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Visit http://127.0.0.1:8000

## Environment Variables

```
SECRET_KEY=your-django-secret-key
DEBUG=True
BREVO_API_KEY=your-brevo-api-key
DATABASE_URL=sqlite:///data/db.sqlite3
```

## Project Structure

```
GraceDesk/
  gracedesk/          # Django project settings
  apps/
    members/          # Profiles, households, groups
    donations/        # Tithe tracking, pledges, receipts
    communications/   # Email templates, Brevo integration
    core/             # Dashboard, settings, church profile
    accounts/         # Auth, roles, permissions
  templates/          # Django + HTMX templates
  static/             # Tailwind CSS, JS
  docs/               # Planning and deployment docs
```

## Documentation

- [Planning & Architecture](docs/PLANNING.md) — Schema, decisions, roadmap
- [Deployment Guide](docs/DEPLOYMENT.md) — Railway deployment steps

## License

MIT
