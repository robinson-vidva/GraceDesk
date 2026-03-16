# GraceDesk — Railway Deployment

## Prerequisites

- GitHub repo with working Django app
- Railway account (trial or Hobby plan)
- Brevo account with API key
- Cloudflare account (for Turnstile keys)
- Custom domain (optional): gracedesk.askdevotions.com

## Step 1: Prepare the Repo

Ensure these files exist in the repo root:

**requirements.txt** — includes at minimum:
```
django>=5.0
django-anymail[brevo]
django-htmx
django-q2
djangorestframework
gunicorn
psycopg2-binary
whitenoise
dj-database-url
python-decouple
Pillow
reportlab
argon2-cffi
cryptography
```

**Procfile:**
```
release: python manage.py migrate && python manage.py setup_gracedesk --no-input
web: gunicorn gracedesk.wsgi --bind 0.0.0.0:$PORT
```

**runtime.txt:**
```
python-3.12.x
```

## Step 2: Create Railway Project

1. Go to https://railway.com/new
2. Click **GitHub Repository**
3. Select `robinson-vidva/GraceDesk`
4. Railway auto-detects Django and begins first deploy

## Step 3: Add PostgreSQL

1. In your Railway project canvas, click **+ New**
2. Select **Database** > **PostgreSQL**
3. Railway automatically injects `DATABASE_URL` into your service

## Step 4: Set Environment Variables

In your web service, click **Variables** tab, then **Raw Editor** and paste:

```
ALLOWED_HOSTS=".up.railway.app,gracedesk.askdevotions.com"
BREVO_API_KEY=<your-brevo-api-key>
DATABASE_URL="${{Postgres.DATABASE_URL}}"
DEBUG="False"
DJANGO_SETTINGS_MODULE="gracedesk.settings.production"
SECRET_KEY=<generate-a-random-key>
```

Generate SECRET_KEY:
```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

Note: Brevo API key, Turnstile keys, church settings, and email config are managed inside the app via Admin Settings page — not as environment variables.

## Step 5: First Deploy

Railway auto-deploys when you push to `main`. The Procfile release command runs:
1. `python manage.py migrate` — creates all tables
2. `python manage.py setup_gracedesk --no-input` — creates default settings, categories, and admin user

## Step 6: First Login

1. Visit your Railway URL (e.g., `web-production-xxxxx.up.railway.app`)
2. Click Login
3. Email: `admin@gracedesk.local`
4. Password: `changeme123`
5. You'll be forced to change the password
6. Go to Admin Settings to configure:
   - Church name, logo, address, phone, email
   - EIN/Tax ID (for tax reports)
   - Brevo API key and email settings
   - Cloudflare Turnstile site key and secret key
   - Contribution categories
   - Bible verses for email rotation

## Step 7: Custom Domain

### For gracedesk.askdevotions.com:

**In Railway:**
1. Click web service > **Settings** > **Networking** > **Custom Domain**
2. Add `gracedesk.askdevotions.com`

**In your DNS (where askdevotions.com is managed):**
1. Add a CNAME record:
   - Name: `gracedesk`
   - Value: the `.up.railway.app` domain Railway provides
2. Railway auto-provisions SSL certificate

**Update ALLOWED_HOSTS** to include the custom domain (already done in Step 4).

## Step 8: Brevo Webhook Setup (Optional, Phase 2)

1. In Brevo dashboard: **Settings** > **Webhooks**
2. Add webhook URL: `https://gracedesk.askdevotions.com/api/webhooks/brevo/`
3. Select events: delivered, opened, clicked, hard_bounce, soft_bounce, spam, unsubscribed

## Auto-Deploy

Railway auto-deploys on every push to `main`. Push code to GitHub, Railway builds and deploys automatically.

## Useful Railway CLI Commands

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Run commands on Railway
railway run python manage.py migrate
railway run python manage.py setup_gracedesk
railway run python manage.py createsuperuser
railway run python manage.py collectstatic --noinput

# View logs
railway logs
```

## Cost

- **Railway Hobby plan:** $5/month (includes $5 usage credits)
- **PostgreSQL:** included in usage credits
- **Brevo:** free tier (300 emails/day)
- **Cloudflare Turnstile:** free
- **Custom domain:** depends on registrar
- **Expected total:** ~$5/month
