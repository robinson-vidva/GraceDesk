import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { one } from '../db.js';
import { verifyPassword, createPlatformSession, getPlatformSession, destroyPlatformSession } from '../auth.js';
import { field, submitBtn, authCard, alertBox } from '../views/forms.js';
import { table, badge } from '../views/admin.js';
import { formatMoney } from '../services/settings.js';
import {
  getPlatformAdminByEmail, getPlatformAdmin, listChurchesWithStats,
  getChurchStats, setChurchStatus, setCustomDomain,
} from '../services/platform.js';

export const platform = new Hono();

// Minimal operator chrome (deliberately distinct from the church-facing UI).
function shell(title, admin, body) {
  return html`<!doctype html><html lang="en"><head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · GraceDesk Operations</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/css/app.css" />
    <style>:root{--brand:#334e5c;--brand-ink:#22343d}</style>
  </head><body>
    <header class="site-header"><div class="container">
      <a href="/platform" class="brandmark"><span class="mark">G</span><span>GraceDesk Operations</span></a>
      <nav class="nav">${admin ? html`<span class="muted small">${admin.email}</span><a href="/platform/logout">Sign out</a>` : ''}</nav>
    </div></header>
    <main class="main"><div class="container">${body}</div></main>
  </body></html>`;
}

async function currentAdmin(c) {
  const s = await getPlatformSession(c);
  if (!s) return null;
  return getPlatformAdmin(c.env.DB, s.adminId);
}

// --- Auth ------------------------------------------------------------------

platform.get('/login', async (c) => {
  if (await currentAdmin(c)) return c.redirect('/platform');
  return c.html(shell('Sign in', null, authCard('Operator sign in', html`
    <form method="post" action="/platform/login">
      ${field({ label: 'Email', name: 'email', type: 'email', required: true })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true })}
      ${submitBtn('Sign in')}
    </form>`)));
});

platform.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const admin = await getPlatformAdminByEmail(c.env.DB, (form.email || '').toString());
  const ok = admin?.password_hash && await verifyPassword((form.password || '').toString(), admin.password_hash);
  if (!ok) {
    return c.html(shell('Sign in', null, authCard('Operator sign in', html`
      ${alertBox('error', 'Incorrect email or password.')}
      <form method="post" action="/platform/login">
        ${field({ label: 'Email', name: 'email', type: 'email', value: (form.email || '').toString(), required: true })}
        ${field({ label: 'Password', name: 'password', type: 'password', required: true })}
        ${submitBtn('Sign in')}
      </form>`)));
  }
  await createPlatformSession(c, admin.id);
  return c.redirect('/platform');
});

platform.get('/logout', async (c) => { await destroyPlatformSession(c); return c.redirect('/platform/login'); });

// Guard everything below.
platform.use('*', async (c, next) => {
  const admin = await currentAdmin(c);
  if (!admin) return c.redirect('/platform/login');
  c.set('padmin', admin);
  await next();
});

// --- Dashboard -------------------------------------------------------------

platform.get('/', async (c) => {
  const admin = c.get('padmin');
  const q = c.req.query('q') || '';
  const churches = await listChurchesWithStats(c.env.DB, q);
  const active = churches.filter((x) => x.status === 'active').length;
  const body = html`
    <div class="between mb-2"><h1 class="page-title" style="margin:0">Churches</h1>
      <form method="get" action="/platform" class="toolbar" style="margin:0">
        <input class="input" type="search" name="q" value="${q}" placeholder="Search churches" />
        <button class="btn btn-ghost btn-sm">Search</button>
      </form></div>
    <p class="muted small mb-2">${churches.length} church(es) · ${active} active</p>
    ${table([
      { head: 'Church', cell: (x) => html`<a href="/platform/churches/${x.id}">${x.name}</a>` },
      { head: 'Slug', cell: (x) => html`<a href="/c/${x.slug}" target="_blank">/c/${x.slug}</a>` },
      { head: 'Members', cell: (x) => x.members },
      { head: 'Gifts', cell: (x) => x.gifts },
      { head: 'Status', cell: (x) => badge(x.status === 'active' ? 'active' : 'inactive') },
      { head: 'Domain', cell: (x) => x.custom_domain || html`<span class="muted">—</span>` },
    ], churches, 'No churches yet.')}`;
  return c.html(shell('Churches', admin, body));
});

// --- Church detail ---------------------------------------------------------

platform.get('/churches/:id', async (c) => {
  const admin = c.get('padmin');
  const id = c.req.param('id');
  const church = await one(c.env.DB, 'SELECT * FROM churches WHERE id = ?', id);
  if (!church) return c.html(shell('Not found', admin, html`<p>Church not found. <a href="/platform">Back</a></p>`), 404);
  const stats = await getChurchStats(c.env.DB, id);
  const suspended = church.status === 'suspended';
  const body = html`
    <p class="small"><a href="/platform">← All churches</a></p>
    <div class="between mb-2"><h1 class="page-title" style="margin:0">${church.name}</h1>${badge(suspended ? 'inactive' : 'active')}</div>
    <div class="tiles mb-2">
      ${statTile('Members', stats.members)}
      ${statTile('Users', stats.users)}
      ${statTile('Gifts', stats.gifts)}
      ${statTile('Total recorded', formatMoney(stats.total, 'USD'))}
      ${statTile('Emails', stats.emails)}
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="label muted small mb-2">Access</div>
        <p class="small">Portal: <a href="/c/${church.slug}" target="_blank">/c/${church.slug}</a></p>
        <form method="post" action="/platform/churches/${id}/status" class="mt-1">
          <input type="hidden" name="status" value="${suspended ? 'active' : 'suspended'}" />
          <button class="btn ${suspended ? 'btn-primary' : 'btn-ghost link-danger'} btn-sm"
            onsubmit="return confirm('Are you sure?')">${suspended ? 'Reactivate church' : 'Suspend church'}</button>
        </form>
      </div>
      <div class="card">
        <div class="label muted small mb-2">Custom domain</div>
        <form method="post" action="/platform/churches/${id}/domain">
          ${field({ label: 'Domain', name: 'custom_domain', value: church.custom_domain || '', placeholder: 'giving.theirchurch.org', hint: 'Point this hostname to the Worker (Cloudflare for SaaS). Visitors are routed to this church.' })}
          ${submitBtn('Save domain')}
        </form>
      </div>
    </div>`;
  return c.html(shell(church.name, admin, body));
});

platform.post('/churches/:id/status', async (c) => {
  const form = await c.req.parseBody();
  const status = form.status === 'suspended' ? 'suspended' : 'active';
  await setChurchStatus(c.env.DB, c.req.param('id'), status);
  return c.redirect(`/platform/churches/${c.req.param('id')}`);
});

platform.post('/churches/:id/domain', async (c) => {
  const form = await c.req.parseBody();
  const domain = (form.custom_domain || '').toString().trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  await setCustomDomain(c.env.DB, c.req.param('id'), domain);
  return c.redirect(`/platform/churches/${c.req.param('id')}`);
});

function statTile(label, value) {
  return html`<div class="card"><div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div></div>`;
}
