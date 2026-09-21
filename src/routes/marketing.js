import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { layout, card } from '../views/layout.js';
import { field, submitBtn, authCard, alertBox } from '../views/forms.js';
import { all, one } from '../db.js';
import { createChurchWithAdmin, uniqueSlug } from '../services/churches.js';
import { createSession } from '../auth.js';
import { audit } from '../services/audit.js';

// Global (tenant-less) pages: marketing landing, find-a-church, church signup.
export const marketing = new Hono();

const G = { settings: null, user: null, base: '' }; // global layout ctx
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

marketing.get('/', (c) => {
  const body = html`
    <div class="text-center py-10">
      <h1 class="text-4xl font-bold text-slate-900">Church giving records,<br/>without the monthly bill.</h1>
      <p class="mt-4 text-lg text-slate-600 max-w-xl mx-auto">
        GraceDesk is a free member portal and contribution tracker for churches.
        Record giving, send thank-you notes, and hand members their tax statements — all in one place.
      </p>
      <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/signup" class="btn-brand text-white font-medium rounded-lg px-6 py-3">Start your church — free</a>
        <a href="/find" class="bg-white border border-slate-300 font-medium rounded-lg px-6 py-3 hover:bg-slate-50">Find your church</a>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto mt-4">
      ${feat('🧾', 'Tax-ready statements', 'Members download monthly & annual PDF giving statements themselves.')}
      ${feat('✉️', 'Automatic thank-yous', 'Every recorded gift triggers a branded thank-you email with a Bible verse.')}
      ${feat('👪', 'Families & directory', 'Group households, approve members, and keep your directory current.')}
      ${feat('🔒', 'Private by design', 'Each church only ever sees its own data. No money ever changes hands here.')}
      ${feat('🎨', 'Your branding', 'Your church name, logo, and colors — members see you, not us.')}
      ${feat('⚡', 'Runs on Cloudflare', 'Fast everywhere, and free to run at church scale.')}
    </div>`;
  return c.html(layout({ ...G, title: 'Free church contribution tracking' }, body));
});

// --- Find your church ------------------------------------------------------

marketing.get('/find', (c) => c.html(findPage()));

marketing.post('/find', async (c) => {
  const form = await c.req.parseBody();
  const q = (form.q || '').trim();
  if (!q) return c.html(findPage({ error: 'Please enter your church name.' }));

  // Exact slug match wins; otherwise fuzzy name search.
  const bySlug = await one(c.env.DB, "SELECT slug, name FROM churches WHERE slug = ? AND status != 'suspended'", q.toLowerCase());
  if (bySlug) return c.redirect(`/c/${bySlug.slug}/login`);

  const matches = await all(
    c.env.DB,
    "SELECT slug, name FROM churches WHERE name LIKE ? AND status != 'suspended' ORDER BY name LIMIT 10",
    `%${q}%`,
  );
  return c.html(findPage({ q, matches }));
});

// --- Sign up a new church --------------------------------------------------

marketing.get('/signup', (c) => c.html(signupPage()));

marketing.post('/signup', async (c) => {
  const form = await c.req.parseBody();
  const v = {
    church_name: (form.church_name || '').trim(),
    first_name: (form.first_name || '').trim(),
    last_name: (form.last_name || '').trim(),
    email: (form.email || '').trim().toLowerCase(),
  };
  const fail = (error) => c.html(signupPage({ error, values: v }));

  if (!v.church_name) return fail('Please enter your church name.');
  if (!v.first_name || !v.last_name) return fail('Please enter your name.');
  if (!validEmail(v.email)) return fail('Please enter a valid email.');
  if ((form.password || '').length < 8) return fail('Password must be at least 8 characters.');
  if (form.password !== form.password2) return fail('Passwords do not match.');

  const slug = await uniqueSlug(c.env.DB, v.church_name);
  const { churchId, userId } = await createChurchWithAdmin(c.env.DB, {
    name: v.church_name,
    slug,
    adminEmail: v.email,
    adminPassword: form.password,
    adminFirst: v.first_name,
    adminLast: v.last_name,
  });
  await createSession(c, userId, churchId);
  await audit(c, 'create', 'church', churchId, { slug, self_signup: true });
  return c.redirect(`/c/${slug}/dashboard`);
});

marketing.get('/healthz', (c) => c.json({ ok: true, app: 'gracedesk' }));

// --- views -----------------------------------------------------------------

function findPage({ q = '', matches, error } = {}) {
  const inner = html`
    <form method="post" action="/find">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Church name', name: 'q', value: q, required: true, placeholder: 'e.g. First Baptist' })}
      ${submitBtn('Find')}
    </form>
    ${matches
      ? (matches.length
        ? html`<div class="mt-4 divide-y border rounded-lg">
            ${matches.map((m) => html`<a href="/c/${m.slug}/login" class="block px-4 py-3 hover:bg-slate-50 flex justify-between items-center">
              <span class="font-medium">${m.name}</span>
              <span class="text-brand text-sm">Go →</span></a>`)}
          </div>`
        : html`<p class="mt-4 text-sm text-slate-500">No churches found. Ask your admin for the link, or <a href="/signup" class="text-brand hover:underline">start a new church</a>.</p>`)
      : ''}`;
  return layout({ ...G, title: 'Find your church' }, authCard('Find your church', inner,
    'Enter your church name to reach its portal.'));
}

function signupPage({ error, values = {} } = {}) {
  const inner = html`
    <form method="post" action="/signup">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Church name', name: 'church_name', value: values.church_name || '', required: true, placeholder: 'First Baptist Church' })}
      <hr class="my-4 border-slate-200" />
      <p class="text-sm text-slate-500 mb-2">Your administrator account</p>
      <div class="grid grid-cols-2 gap-3">
        <div>${field({ label: 'First name', name: 'first_name', value: values.first_name || '', required: true })}</div>
        <div>${field({ label: 'Last name', name: 'last_name', value: values.last_name || '', required: true })}</div>
      </div>
      ${field({ label: 'Email', name: 'email', type: 'email', value: values.email || '', required: true, autocomplete: 'email' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters' })}
      ${field({ label: 'Confirm password', name: 'password2', type: 'password', required: true, autocomplete: 'new-password' })}
      ${submitBtn('Create church')}
    </form>
    <div class="mt-4 text-sm text-center text-slate-500">
      Already have a church? <a href="/find" class="text-brand hover:underline">Find it</a>
    </div>`;
  return layout({ ...G, title: 'Start your church' }, authCard('Start your church on GraceDesk', inner,
    'Free. Takes a minute. You become the first admin.'));
}

function feat(icon, title, text) {
  return card(html`
    <div class="text-2xl">${icon}</div>
    <div class="font-semibold text-slate-900 mt-2">${title}</div>
    <div class="text-sm text-slate-500 mt-1">${text}</div>`);
}
