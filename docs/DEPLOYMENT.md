# Deploying GraceDesk to Cloudflare

GraceDesk runs entirely on Cloudflare: a Worker (the app), D1 (SQLite database),
and R2 (logos and cached PDF statements). At church scale it fits comfortably
in Cloudflare's free tiers.

## Prerequisites

- A Cloudflare account
- Node 18+ and this repository cloned
- `npm install` has been run

## 1. Log in

```bash
npx wrangler login
```

## 2. Create the database and bucket

```bash
npx wrangler d1 create gracedesk
npx wrangler r2 bucket create gracedesk-files
```

`d1 create` prints a `database_id`. Paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "gracedesk"
database_id = "PASTE-THE-ID-HERE"
migrations_dir = "migrations"
```

## 3. Apply the schema

```bash
npm run db:migrate:remote
```

## 4. Set secrets

Secrets are per deployment and are never committed. `ADMIN_*` seed the demo
church on first boot; the email and Turnstile values are optional (each church
can also set its own Resend key and Turnstile keys from Admin → Settings).

```bash
npx wrangler secret put ADMIN_EMAIL          # e.g. you@yourchurch.org
npx wrangler secret put ADMIN_PASSWORD       # a strong password
npx wrangler secret put RESEND_API_KEY       # optional (platform-wide fallback)
npx wrangler secret put TURNSTILE_SECRET_KEY # optional
```

You can also set `APP_URL` (your final URL, used in email links) either as a
secret or under `[vars]` in `wrangler.toml`.

## 5. Deploy

```bash
npm run deploy
```

Wrangler prints your Worker URL (e.g. `https://gracedesk.<account>.workers.dev`).
Open it, then:

1. Go to `/c/demo/login` and sign in with the `ADMIN_*` you set (you'll be asked
   to change the password), **or** create a fresh church at `/signup`.
2. In Admin → Settings, set the church name, brand color, logo, address, EIN,
   and (optionally) a Resend API key and Turnstile keys.

## Custom domain (optional)

Add a route in the Cloudflare dashboard (Workers → your worker → Triggers →
Custom Domains), e.g. `giving.yourchurch.org`, and set `APP_URL` to match.

## Email (Resend)

GraceDesk sends transactional email through [Resend](https://resend.com). Create
an API key and verify your sending domain, then set `RESEND_API_KEY` (platform
fallback) or enter a key per church under Admin → Settings → Email. Without a
key, email is skipped and password-reset links are shown on screen.

## Scheduled greetings

`wrangler.toml` includes a daily Cron Trigger (`0 13 * * *`) that sends birthday
and anniversary greetings, and a prior-month giving summary on the 1st. It only
sends for churches that have email configured. To test locally:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+13+*+*+*"
```

## Local development

```bash
npm run db:migrate      # local D1
npm run dev             # http://localhost:8787
```

A `demo` church and admin are seeded automatically on first request.
