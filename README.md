# GraceDesk

A simple, open-source church contribution tracker and member portal.

Built for churches that can't afford $70-120/month for Tithe.ly, Breeze, or Planning Center.

## What It Does

**For Church Members:**
- Register and get approved by admin
- Login to see your contribution history
- Download monthly and annual tax reports (PDF)
- Update your profile

**For Church Admins:**
- Approve new member registrations
- Record contributions (cash, check, Zelle, bank transfer, Zeffy, Stripe)
- Automatically send thank-you emails on each contribution
- Generate reports by member, month, or year

**GraceDesk does NOT collect money.** Donations happen elsewhere. GraceDesk only tracks what was given and communicates with members.

## Tech Stack

- **Backend:** Django 5.x
- **Frontend:** Django Templates + HTMX + Tailwind CSS
- **Database:** PostgreSQL (Railway)
- **Email:** Brevo API via django-anymail
- **Deployment:** Railway ($5/month)

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

## Documentation

- [Planning & Architecture](docs/PLANNING.md) — Schema, user flows, roadmap
- [Deployment Guide](docs/DEPLOYMENT.md) — Railway deployment steps

## License

MIT
