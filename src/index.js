import { Hono } from 'hono';
import { ensureSeeded } from './data/seed.js';
import { loadContext } from './middleware.js';
import { pages } from './routes/pages.js';
import { auth } from './routes/auth.js';
import { dashboard } from './routes/dashboard.js';

const app = new Hono();

// First-run seed (idempotent; cheap after the first call).
app.use('*', async (c, next) => {
  await ensureSeeded(c.env);
  await next();
});

// Load church settings + current user for every request.
app.use('*', loadContext);

// Serve the church logo from R2.
app.get('/logo', async (c) => {
  const key = c.get('ctx').settings?.church_logo_key;
  if (!key) return c.notFound();
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/png', 'Cache-Control': 'public, max-age=300' },
  });
});

// Routes.
app.route('/', auth);
app.route('/', dashboard);
app.route('/', pages);

app.notFound((c) => c.text('Not found', 404));
app.onError((err, c) => {
  console.error(err);
  return c.text('Something went wrong', 500);
});

export default app;
