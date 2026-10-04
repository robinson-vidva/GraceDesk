import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout } from '../views/layout.js';
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
    <div class="split">
      <section class="hero">
        <h1>The giving record book for your church</h1>
        <p>Write down each gift once. Members can then see their own record and
           print a statement at tax time. GraceDesk is free, and it never handles money.</p>
        <div class="actions">
          <a href="/signup" class="btn btn-primary">Set up your church</a>
          <a href="/find" class="btn btn-ghost">Find your church</a>
        </div>
      </section>

      <figure class="sample">
        <figcaption>Example: what a member sees</figcaption>
        <div class="sheet">
          <div class="sheet-title">Mary Thomas</div>
          <div class="muted small">Giving record, January</div>
          <div class="table-wrap mt-1">
            <table class="table">
              <thead><tr><th>Date</th><th>Fund</th><th>Paid by</th><th class="num">Amount</th></tr></thead>
              <tbody>
                <tr><td>Jan 5</td><td>Tithe</td><td>Check</td><td class="num">$200.00</td></tr>
                <tr><td>Jan 12</td><td>Building fund</td><td>Cash</td><td class="num">$50.00</td></tr>
                <tr><td>Jan 19</td><td>Tithe</td><td>Zelle</td><td class="num">$200.00</td></tr>
                <tr><td>Jan 26</td><td>Missions</td><td>Online</td><td class="num">$75.00</td></tr>
                <tr class="total"><td colspan="3">Total for January</td><td class="num">$525.00</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </figure>
    </div>

    <h2 class="mt-3">How it works</h2>
    <ol class="steps">
      <li><div><strong>The church records each gift.</strong>
        Cash, check, Zelle, bank transfer or online. One at a time, or a whole Sunday at once.</div></li>
      <li><div><strong>The member gets a thank-you.</strong>
        An email with the amount, a receipt number and a Bible verse.</div></li>
      <li><div><strong>The member prints a statement.</strong>
        Monthly or yearly, as a PDF that is ready for tax filing.</div></li>
    </ol>

    <p class="muted mt-3">Each church sees only its own records, under its own name, logo and color.
      GraceDesk is open source.</p>`;
  return c.html(layout({ ...G, title: 'The giving record book for your church' }, body));
});

// --- Find your church ------------------------------------------------------

marketing.get('/find', (c) => c.html(findPage()));

marketing.post('/find', async (c) => {
  const form = await c.req.parseBody();
  const q = (form.q || '').trim();
  if (!q) return c.html(findPage({ error: 'Please enter your church name.' }));

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
      ${field({ label: 'Church name', name: 'q', value: q, required: true, placeholder: 'For example, First Baptist' })}
      ${submitBtn('Find')}
    </form>
    ${matches
      ? (matches.length
        ? html`<div class="card mt-2" style="padding:0">
            ${matches.map((m, i) => html`<a href="/c/${m.slug}/login" style="display:flex;justify-content:space-between;padding:0.8rem 1rem;${i ? 'border-top:1px solid var(--line)' : ''}">
              <span>${m.name}</span><span class="small">Open</span></a>`)}
          </div>`
        : html`<p class="muted small mt-2">No churches found. Ask your administrator for the link, or <a href="/signup">set up a new church</a>.</p>`)
      : ''}`;
  return layout({ ...G, title: 'Find your church' }, authCard('Find your church', inner,
    'Enter your church name to reach its portal.'));
}

function signupPage({ error, values = {} } = {}) {
  const inner = html`
    <form method="post" action="/signup">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Church name', name: 'church_name', value: values.church_name || '', required: true, placeholder: 'First Baptist Church' })}
      <hr class="divider" />
      <p class="muted small">Your administrator account</p>
      <div class="row">
        <div>${field({ label: 'First name', name: 'first_name', value: values.first_name || '', required: true })}</div>
        <div>${field({ label: 'Last name', name: 'last_name', value: values.last_name || '', required: true })}</div>
      </div>
      ${field({ label: 'Email', name: 'email', type: 'email', value: values.email || '', required: true, autocomplete: 'email' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters' })}
      ${field({ label: 'Confirm password', name: 'password2', type: 'password', required: true, autocomplete: 'new-password' })}
      ${submitBtn('Set up church')}
    </form>
    <p class="muted small center mt-1">Already have a church? <a href="/find">Find it</a></p>`;
  return layout({ ...G, title: 'Set up your church' }, authCard('Set up your church', inner,
    'Free to use. You will be the first administrator.'));
}

