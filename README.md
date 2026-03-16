# GraceDesk

A simple, open-source church contribution tracker and member portal.

Built for churches that can't afford $70-120/month for Tithe.ly, Breeze, or Planning Center.

## What It Does

**For Church Members:**
- Register and get approved by church admin
- Login to view your contribution history
- Download monthly and annual tax reports (PDF)
- Update your profile and family information

**For Church Admins:**
- Approve new member registrations
- Record contributions (cash, check, Zelle, bank transfer, Zeffy, Stripe, PayPal)
- Auto-send thank-you emails with Bible verses on each contribution
- Manage families and member profiles
- Generate reports and visualize contribution trends
- Customize church branding, categories, and email templates

**GraceDesk does NOT collect money.** Donations happen elsewhere. GraceDesk tracks what was given and communicates with members.

## Self-Hosted & Open Source

Each church runs their own GraceDesk instance. Customize it with your church name, logo, colors, and contribution categories. Your data stays on your server.

## Tech Stack

- **Backend:** Django 5.x
- **Frontend:** Django Templates + HTMX + Tailwind CSS
- **Database:** PostgreSQL
- **Email:** Brevo API via django-anymail
- **Bot Protection:** Cloudflare Turnstile
- **Deployment:** Railway ($5/month)

## Quick Start

```bash
git clone https://github.com/robinson-vidva/GraceDesk.git
cd GraceDesk
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py setup_gracedesk
python manage.py runserver
```

Login with `admin@gracedesk.local` / `changeme123` and you'll be prompted to change the password.

## Documentation

- [Planning & Architecture](docs/PLANNING.md) — Schema, user flows, roadmap
- [Deployment Guide](docs/DEPLOYMENT.md) — Railway deployment steps

## Demo

[gracedesk.askdevotions.com](https://gracedesk.askdevotions.com)

## License

MIT

---

*Powered by GraceDesk*
