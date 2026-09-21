import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { ensureSeeded } from './data/seed.js';
import { loadChurchContext } from './middleware.js';
import { marketing } from './routes/marketing.js';
import { pages } from './routes/pages.js';
import { auth } from './routes/auth.js';
import { dashboard } from './routes/dashboard.js';

const app = new Hono();

// Normalize `/path/` -> `/path` (GET only) so trailing slashes don't 404.
app.use(trimTrailingSlash());

// First-run seed (idempotent; creates the demo church on a fresh DB).
app.use('*', async (c, next) => {
  await ensureSeeded(c.env);
  await next();
});

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

export default app;
