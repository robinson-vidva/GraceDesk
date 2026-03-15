# GraceDesk — Railway Deployment

## Prerequisites

- GitHub repo with working Django app
- Railway account (trial or Hobby plan)
- Brevo account with API key

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
```

**Procfile:**
```
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

In your web service settings, add:

```
SECRET_KEY=<generate-a-random-key>
DEBUG=False
ALLOWED_HOSTS=.up.railway.app,gracedesk.org
BREVO_API_KEY=<your-brevo-api-key>
DJANGO_SETTINGS_MODULE=gracedesk.settings.production
```

`DATABASE_URL` is auto-injected by Railway when PostgreSQL is linked.

## Step 5: Run Migrations

In Railway's service settings, add a deploy command or use the Railway CLI:

```bash
railway run python manage.py migrate
railway run python manage.py createsuperuser
```

Or add to **Procfile** as a release command:
```
release: python manage.py migrate
web: gunicorn gracedesk.wsgi --bind 0.0.0.0:$PORT
```

## Step 6: Custom Domain (Hobby plan required)

1. In your service, go to **Settings** > **Networking** > **Custom Domain**
2. Add `gracedesk.org`
3. At your domain registrar, create a CNAME record:
   - Name: `@` or `gracedesk.org`
   - Value: the `.up.railway.app` domain Railway provides
4. Railway auto-provisions SSL certificate

## Step 7: Brevo Webhook Setup

1. In Brevo dashboard, go to **Settings** > **Webhooks**
2. Add webhook URL: `https://gracedesk.org/api/v1/webhooks/brevo/`
3. Select events: delivered, opened, clicked, hard_bounce, soft_bounce, spam, unsubscribed
4. Copy the webhook token and add to Railway env vars:
   ```
   BREVO_WEBHOOK_TOKEN=<your-webhook-token>
   ```

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
railway run python manage.py createsuperuser
railway run python manage.py collectstatic --noinput

# View logs
railway logs
```

## Cost

- **Hobby plan:** $5/month (includes $5 usage credits)
- **PostgreSQL:** included in usage credits
- **Brevo:** free tier (300 emails/day)
- **Expected total:** ~$5/month
