import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { ensureSeeded } from './data/seed.js';
import { loadChurchContext } from './middleware.js';
import { marketing } from './routes/marketing.js';
import { pages } from './routes/pages.js';
import { auth } from './routes/auth.js';
import { dashboard } from './routes/dashboard.js';
import { admin } from './routes/admin.js';
import { adminContributions } from './routes/admin-contributions.js';
import { adminSettings } from './routes/admin-settings.js';
import { adminMissions } from './routes/admin-missions.js';
import { adminBroadcast } from './routes/admin-broadcast.js';
import { adminPledges } from './routes/admin-pledges.js';
import { adminGroups } from './routes/admin-groups.js';
import { adminAttendance } from './routes/admin-attendance.js';
import { runDailyJobs } from './services/scheduled.js';
import { platform } from './routes/platform.js';
import { findByCustomDomain } from './services/platform.js';

const app = new Hono();

// Normalize `/path/` -> `/path` (GET only) so trailing slashes don't 404.
app.use(trimTrailingSlash());

// First-run seed (idempotent; creates the demo church on a fresh DB).
app.use('*', async (c, next) => {
  await ensureSeeded(c.env);
  await next();
});

// Custom-domain routing: if the host is a church's custom domain, route
// visitors into that church. Skipped for platform/asset paths and default hosts.
app.use('*', async (c, next) => {
  const hostname = (c.req.header('host') || '').split(':')[0].toLowerCase();
  const path = c.req.path;
  const skip = !hostname || hostname === 'localhost' || hostname === '127.0.0.1'
    || hostname.endsWith('.workers.dev')
    || path.startsWith('/c/') || path.startsWith('/platform') || path.startsWith('/css/')
    || path.startsWith('/icons/') || path === '/healthz' || path === '/manifest.webmanifest';
  if (!skip) {
    const church = await findByCustomDomain(c.env.DB, hostname);
    if (church) return c.redirect(`/c/${church.slug}${path === '/' ? '' : path}`);
  }
  await next();
});

// Resend delivery webhook: updates email_logs by provider id. If
// RESEND_WEBHOOK_SECRET is set, require it as a ?token= match.
app.post('/webhooks/resend', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (secret && c.req.query('token') !== secret) return c.text('forbidden', 403);
  const evt = await c.req.json().catch(() => null);
  const emailId = evt?.data?.email_id || evt?.data?.id;
  if (evt?.type && emailId) {
    const status = String(evt.type).replace('email.', ''); // delivered | opened | bounced | complained | delivery_delayed
    await c.env.DB.prepare("UPDATE email_logs SET status = ?, updated_at = datetime('now') WHERE provider_id = ?")
      .bind(status, emailId).run();
  }
  return c.json({ ok: true });
});

// ---- Platform operator console (manages all churches) ----
app.route('/platform', platform);

// ---- Church sub-app: everything under /c/:slug is tenant-scoped ----
const church = new Hono();
church.use('*', loadChurchContext);

// Serve this church's logo from R2.
church.get('/logo', async (c) => {
  const key = c.get('ctx').settings?.church_logo_key;
  if (!key) return c.notFound();
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
});

church.route('/admin/contributions', adminContributions);
church.route('/admin/settings', adminSettings);
church.route('/admin/missions', adminMissions);
church.route('/admin/pledges', adminPledges);
church.route('/admin/groups', adminGroups);
church.route('/admin/attendance', adminAttendance);
church.route('/admin/broadcast', adminBroadcast);
church.route('/admin', admin);
church.route('/', auth);
church.route('/', dashboard);
church.route('/', pages);

app.route('/c/:slug', church);

// ---- Global (tenant-less) marketing + signup ----
app.route('/', marketing);

app.notFound((c) => c.text('Not found', 404));
app.onError((err, c) => {
  console.error(err);
  return c.text('Something went wrong', 500);
});

// Worker entry: HTTP via Hono, plus the daily cron trigger.
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyJobs(env));
  },
};
