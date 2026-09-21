# GraceDesk

A simple, open-source church contribution tracker and member portal — running entirely on **Cloudflare** (Workers + D1 + R2).

Built for churches that can't afford $70–120/month for Tithe.ly, Breeze, or Planning Center.

## What It Does

**For Church Members**
- Register and get approved by a church admin
- Log in to view your contribution history
- Download monthly and annual tax reports (PDF)
- Update your profile and family information

**For Church Admins**
- Approve new member registrations
- Record contributions (cash, check, Zelle, bank transfer, Zeffy, Stripe, PayPal)
- Auto-send thank-you emails with a rotating Bible verse
- Manage families and member profiles
- Generate reports and customize church branding, categories, and email templates

**GraceDesk does NOT collect money.** Donations happen elsewhere. GraceDesk tracks what was given and communicates with members.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime / host | Cloudflare Workers |
| Framework | [Hono](https://hono.dev) (server-rendered, no build step) |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 (logos, photos, cached PDFs) |
| Sessions | Signed cookie + D1 session store |
| Passwords | WebCrypto PBKDF2 |
| Bot protection | Cloudflare Turnstile |
| Email | Resend |
| PDF reports | pdf-lib |
| License | MIT |

Everything is self-hosted on your own Cloudflare account. Your data stays in your D1 database.

## Quick Start (local)

```bash
git clone https://github.com/robinson-vidva/GraceDesk.git
cd GraceDesk
npm install
cp .dev.vars.example .dev.vars     # optional: fill in email/turnstile keys
npm run db:migrate                 # create tables in local D1
npm run dev                        # http://localhost:8787
```

On first request the database is seeded with default settings, contribution
categories, starter Bible verses, and a default admin:

```
admin@gracedesk.local / changeme123
```

You'll be forced to change the password on first login.

## Deploy to Cloudflare

```bash
wrangler d1 create gracedesk          # paste the database_id into wrangler.toml
wrangler r2 bucket create gracedesk-files
npm run db:migrate:remote
wrangler secret put ADMIN_PASSWORD
wrangler secret put RESEND_API_KEY    # optional
wrangler secret put TURNSTILE_SECRET_KEY  # optional
npm run deploy
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full guide.

## Documentation

- [Planning & Architecture](docs/PLANNING.md) — schema, user flows, roadmap

## License

MIT

---

*Powered by GraceDesk*
