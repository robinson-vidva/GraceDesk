import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { one, all, run } from '../db.js';
import { requireAdmin, requireSuperAdmin } from '../middleware.js';
import { adminShell, badge, table, toolbar, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { sendEmail, emailShell } from '../services/email.js';
import { randomHex, sha256Hex, hashPassword } from '../auth.js';
import {
  listMembers, getMember, getMemberUser, createMember, updateMember, setMemberStatus,
  countByStatus, fullName, parsePhones,
  listFamilies, getFamily, familyMembers, createFamily, updateFamily, assignFamily,
} from '../services/members.js';
import { formatMoney } from '../services/settings.js';
import { getOrBuildStatement } from '../services/pdf.js';
import { parseCsv } from '../services/csv.js';

export const admin = new Hono();
admin.use('*', requireAdmin);

const cid = (c) => c.get('ctx').church.id;
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROLES = ['head', 'spouse', 'child', 'parent', 'sibling', 'other'];

// --- Overview --------------------------------------------------------------

admin.get('/', async (c) => {
  const ctx = c.get('ctx');
  const churchId = cid(c);
  const pending = await countByStatus(c.env.DB, churchId, 'pending');
  const active = await countByStatus(c.env.DB, churchId, 'active');
  const trow = await one(c.env.DB, `SELECT
      COALESCE(SUM(CASE WHEN date = date('now') THEN amount END),0) AS today,
      COALESCE(SUM(CASE WHEN date >= date('now','-7 day') THEN amount END),0) AS week,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m','now') THEN amount END),0) AS month
    FROM contributions WHERE church_id = ? AND is_deleted = 0`, churchId);
  const recent = await all(c.env.DB, `SELECT a.action, a.entity_type, a.created_at, u.first_name, u.last_name
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.church_id = ? ORDER BY a.created_at DESC LIMIT 8`, churchId);
  const cur = ctx.settings.currency;
  const b = `${ctx.base}/admin`;

  const body = html`
    <form method="get" action="${b}/search" class="toolbar mb-2" style="margin-bottom:1rem">
      <input class="input" type="search" name="q" placeholder="Search members, receipts…" style="max-width:24rem" />
      <button class="btn btn-ghost btn-sm">Search</button>
    </form>
    <div class="tiles mb-2">
      ${tile('Pending approvals', pending, pending ? `${b}/members/pending` : null)}
      ${tile('Active members', active, `${b}/members`)}
      ${tile('Given today', formatMoney(trow.today, cur))}
      ${tile('Given this month', formatMoney(trow.month, cur))}
    </div>
    <div class="wrap-gap mb-2">
      <a href="${b}/contributions/new" class="btn btn-primary btn-sm">Record a contribution</a>
      <a href="${b}/members/new" class="btn btn-ghost btn-sm">Add a member</a>
      <a href="${b}/broadcast" class="btn btn-ghost btn-sm">Email members</a>
      <a href="${b}/reports" class="btn btn-ghost btn-sm">Reports</a>
    </div>
    ${card(html`<div class="label muted small">Recent activity</div>
      ${recent.length ? html`<div class="stack mt-1">${recent.map((r) => html`
        <div class="small"><strong>${[r.first_name, r.last_name].filter(Boolean).join(' ') || 'Someone'}</strong>
          ${r.action} ${r.entity_type || ''} <span class="muted">· ${fmtWhen(r.created_at)}</span></div>`)}</div>`
        : html`<p class="muted small mt-1">No activity yet.</p>`}`)}`;
  return c.html(adminShell(ctx, '', 'Overview', body));
});

// --- Global search ---------------------------------------------------------

admin.get('/search', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c); const cur = ctx.settings.currency;
  const q = (c.req.query('q') || '').trim();
  const b = ctx.base;
  let members = []; let contribs = [];
  if (q) {
    members = await listMembers(c.env.DB, churchId, { q });
    contribs = await all(c.env.DB, `SELECT ct.*, m.first_name, m.last_name FROM contributions ct
      JOIN members m ON m.id = ct.member_id
      WHERE ct.church_id = ? AND ct.is_deleted = 0 AND (ct.receipt_number LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ?)
      ORDER BY ct.date DESC LIMIT 25`, churchId, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const body = html`
    <form method="get" action="${b}/admin/search" class="toolbar mb-2">
      <input class="input" type="search" name="q" value="${q}" placeholder="Search members, receipts…" style="max-width:24rem" autofocus />
      <button class="btn btn-primary btn-sm">Search</button>
    </form>
    ${!q ? empty('Type a name, email, or receipt number.') : html`
      ${card(html`<div class="label muted small mb-2">Members (${members.length})</div>
        ${members.length ? table([
          { head: 'Name', cell: (m) => html`<a href="${b}/admin/members/${m.id}">${fullName(m)}</a>` },
          { head: 'Email', cell: (m) => m.email || '—' },
          { head: 'Status', cell: (m) => badge(m.membership_status) },
        ], members) : empty('No members matched.')}`)}
      <div class="mt-2">${card(html`<div class="label muted small mb-2">Contributions (${contribs.length})</div>
        ${contribs.length ? table([
          { head: 'Date', cell: (r) => r.date },
          { head: 'Member', cell: (r) => `${r.first_name} ${r.last_name}` },
          { head: 'Amount', cell: (r) => formatMoney(r.amount, r.currency || cur) },
          { head: 'Receipt', cell: (r) => html`<a href="${b}/admin/contributions/${r.id}">${r.receipt_number || '—'}</a>` },
        ], contribs) : empty('No contributions matched.')}`)}</div>`}`;
  return c.html(adminShell(ctx, '', q ? `Search: ${q}` : 'Search', body));
});

// --- Members list ----------------------------------------------------------

admin.get('/members', async (c) => {
  const ctx = c.get('ctx');
  const q = c.req.query('q') || '';
  const status = c.req.query('status') || '';
  const rows = await listMembers(c.env.DB, cid(c), { q, status });
  const b = `${ctx.base}/admin`;

  const body = html`
    ${toolbar(html`
      <form class="toolbar" method="get" action="${b}/members" style="margin:0">
        <input class="input" type="search" name="q" value="${q}" placeholder="Search name or email" />
        <select class="input" name="status" onchange="this.form.submit()">
          ${['', 'active', 'pending', 'inactive'].map((s) => html`<option value="${s}" ${raw(s === status ? 'selected' : '')}>${s ? cap(s) : 'All statuses'}</option>`)}
        </select>
        <button class="btn btn-ghost btn-sm" type="submit">Search</button>
      </form>
      <div class="wrap-gap" style="margin-left:auto">
        <a href="${b}/members/import" class="btn btn-ghost btn-sm">Import CSV</a>
        <a href="${b}/members/new" class="btn btn-primary btn-sm">Add member</a>
      </div>`)}
    ${table([
      { head: 'Name', cell: (m) => html`<a href="${b}/members/${m.id}">${fullName(m)}</a>` },
      { head: 'Email', cell: (m) => m.email || html`<span class="muted">—</span>` },
      { head: 'Phone', cell: (m) => parsePhones(m.phones)[0] || html`<span class="muted">—</span>` },
      { head: 'Family', cell: (m) => m.family_name || html`<span class="muted">—</span>` },
      { head: 'Status', cell: (m) => badge(m.membership_status) },
    ], rows, 'No members match.')}`;
  return c.html(adminShell(ctx, '/members', 'Members', body));
});

admin.get('/members/pending', async (c) => {
  const ctx = c.get('ctx');
  const rows = await listMembers(c.env.DB, cid(c), { status: 'pending' });
  const b = `${ctx.base}/admin`;
  const body = rows.length ? html`<div class="stack">${rows.map((m) => card(html`
      <div class="between">
        <div>
          <div><strong>${fullName(m)}</strong></div>
          <div class="muted small">${m.email || 'no email'} · registered ${fmtWhen(m.created_at)}</div>
        </div>
        <div class="wrap-gap">
          <form method="post" action="${b}/members/${m.id}/approve"><button class="btn btn-primary btn-sm">Approve</button></form>
          <form method="post" action="${b}/members/${m.id}/reject" onsubmit="return confirm('Reject this registration?')"><button class="btn btn-ghost btn-sm link-danger">Reject</button></form>
        </div>
      </div>`))}</div>`
    : empty('No pending registrations. You are all caught up.');
  return c.html(adminShell(ctx, '/members', 'Pending approvals', body));
});

admin.post('/members/:id/approve', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const m = await getMember(c.env.DB, churchId, id);
  if (!m) return c.notFound();
  await setMemberStatus(c.env.DB, churchId, id, 'active');
  await run(c.env.DB, 'UPDATE users SET is_active = 1 WHERE church_id = ? AND member_id = ?', churchId, id);
  await audit(c, 'approve', 'member', id);
  if (m.email) {
    const login = `${c.env.APP_URL || new URL(c.req.url).origin}${ctx.base}/login`;
    await sendEmail(c.env, ctx.settings, {
      to: m.email, type: 'welcome', memberId: m.id,
      subject: `Welcome to ${ctx.settings.church_name}`,
      html: emailShell(ctx.settings, `<p>Dear ${m.first_name},</p>
        <p>Your account has been approved. You can now sign in to view your giving and download statements.</p>
        <p style="margin:20px 0"><a href="${login}" style="background:${ctx.settings.primary_color};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Sign in</a></p>`),
    });
  }
  return c.redirect(`${ctx.base}/admin/members/pending`);
});

admin.post('/members/:id/reject', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  await setMemberStatus(c.env.DB, churchId, id, 'inactive');
  await run(c.env.DB, 'UPDATE users SET is_active = 0 WHERE church_id = ? AND member_id = ?', churchId, id);
  await audit(c, 'reject', 'member', id);
  return c.redirect(`${ctx.base}/admin/members/pending`);
});

admin.post('/members/:id/deactivate', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  await setMemberStatus(c.env.DB, churchId, id, 'inactive');
  await run(c.env.DB, 'UPDATE users SET is_active = 0 WHERE church_id = ? AND member_id = ?', churchId, id);
  await audit(c, 'update', 'member', id, { deactivated: true });
  return c.redirect(`${ctx.base}/admin/members/${id}`);
});

admin.post('/members/:id/reactivate', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  await setMemberStatus(c.env.DB, churchId, id, 'active');
  await audit(c, 'update', 'member', id, { reactivated: true });
  return c.redirect(`${ctx.base}/admin/members/${id}`);
});

// --- Member CSV import -----------------------------------------------------

admin.get('/members/import', (c) => {
  const ctx = c.get('ctx');
  const b = `${ctx.base}/admin/members`;
  const body = card(html`
    <h2 style="font-size:1.15rem">Import members from CSV</h2>
    <p class="muted small">Include a header row. Recognized columns: <code>first_name, last_name, email, phone, city, state</code>. Everyone is imported as an active member (no login).</p>
    <form method="post" action="${b}/import" enctype="multipart/form-data" class="mt-1">
      <input class="input" type="file" name="file" accept=".csv,text/csv" />
      <p class="muted small mt-1">…or paste CSV:</p>
      <textarea class="input" name="csv" rows="6" placeholder="first_name,last_name,email,phone&#10;Jane,Doe,jane@example.com,555-1234"></textarea>
      ${submitBtn('Import')}
    </form>`);
  return c.html(adminShell(ctx, '/members', 'Import members', body));
});

admin.post('/members/import', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  let textCsv = (form.csv || '').toString();
  const file = form.file;
  if (file && typeof file === 'object' && file.text) textCsv = await file.text();

  const rows = parseCsv(textCsv);
  let created = 0; let skipped = 0;
  if (rows.length) {
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const idx = (names) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
    const iFirst = idx(['first_name', 'first', 'firstname']);
    const iLast = idx(['last_name', 'last', 'lastname']);
    const iEmail = idx(['email', 'e-mail']);
    const iPhone = idx(['phone', 'phone_number', 'mobile']);
    const iCity = idx(['city']); const iState = idx(['state']);
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const first = (iFirst >= 0 ? row[iFirst] : '')?.trim();
      const last = (iLast >= 0 ? row[iLast] : '')?.trim();
      if (!first || !last) { skipped++; continue; }
      const phone = iPhone >= 0 ? (row[iPhone] || '').trim() : '';
      await createMember(c.env.DB, churchId, {
        first_name: first, last_name: last,
        email: iEmail >= 0 ? (row[iEmail] || '').trim().toLowerCase() : '',
        phones: phone ? [phone] : [],
        city: iCity >= 0 ? (row[iCity] || '').trim() : '',
        state: iState >= 0 ? (row[iState] || '').trim() : '',
        membership_status: 'active',
      });
      created++;
    }
  }
  await audit(c, 'create', 'member', null, { imported: created, skipped });
  const body = card(html`${alertBox('success', `Imported ${created} member(s).${skipped ? ` Skipped ${skipped} row(s) missing a name.` : ''}`)}
    <a href="${ctx.base}/admin/members" class="btn btn-primary btn-sm mt-1">View members</a>`);
  return c.html(adminShell(ctx, '/members', 'Import complete', body));
});

// --- Member create ---------------------------------------------------------

admin.get('/members/new', async (c) => {
  const ctx = c.get('ctx');
  const families = await listFamilies(c.env.DB, cid(c));
  return c.html(adminShell(ctx, '/members', 'Add member', memberForm(ctx, { families, action: `${ctx.base}/admin/members/new`, submitLabel: 'Create member', isNew: true })));
});

admin.post('/members/new', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const d = readMemberForm(form);
  if (!d.first_name || !d.last_name) {
    const families = await listFamilies(c.env.DB, churchId);
    return c.html(adminShell(ctx, '/members', 'Add member', memberForm(ctx, { values: d, families, action: `${ctx.base}/admin/members/new`, submitLabel: 'Create member', isNew: true, error: 'First and last name are required.' })));
  }
  d.membership_status = 'active';
  const memberId = await createMember(c.env.DB, churchId, d);
  await audit(c, 'create', 'member', memberId);

  // Optionally create a login and email an invite to set a password.
  if (form.create_login === 'on' && d.email) {
    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expires = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const tmp = await hashPassword(randomHex(16));
    await run(c.env.DB, `INSERT INTO users (church_id, email, password_hash, first_name, last_name, is_active, member_id, reset_token_hash, reset_expires)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      churchId, d.email.toLowerCase(), tmp, d.first_name, d.last_name, memberId, tokenHash, expires);
    const link = `${c.env.APP_URL || new URL(c.req.url).origin}${ctx.base}/reset-password/${token}`;
    await sendEmail(c.env, ctx.settings, {
      to: d.email, type: 'invite', memberId,
      subject: `You've been added to ${ctx.settings.church_name}`,
      html: emailShell(ctx.settings, `<p>Dear ${d.first_name},</p>
        <p>An account has been created for you at ${ctx.settings.church_name}. Set your password to sign in.</p>
        <p style="margin:20px 0"><a href="${link}" style="background:${ctx.settings.primary_color};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Set your password</a></p>`),
    });
  }
  return c.redirect(`${ctx.base}/admin/members/${memberId}`);
});

// --- Member detail + edit --------------------------------------------------

admin.get('/members/:id', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const m = await getMember(c.env.DB, churchId, id);
  if (!m) return c.notFound();
  const b = `${ctx.base}/admin`;
  const login = await getMemberUser(c.env.DB, churchId, id);
  const family = m.family_id ? await getFamily(c.env.DB, churchId, m.family_id) : null;
  const contribs = await all(c.env.DB, `SELECT ct.*, cc.name AS category FROM contributions ct
     LEFT JOIN contribution_categories cc ON cc.id = ct.category_id
     WHERE ct.church_id = ? AND ct.member_id = ? AND ct.is_deleted = 0 ORDER BY ct.date DESC LIMIT 20`, churchId, id);
  const cur = ctx.settings.currency;
  const phones = parsePhones(m.phones);
  const notes = ctx.settings.notes_enabled
    ? await all(c.env.DB, `SELECT n.*, u.first_name, u.last_name FROM member_notes n
        LEFT JOIN users u ON u.id = n.created_by_id WHERE n.church_id = ? AND n.member_id = ? ORDER BY n.created_at DESC`, churchId, id)
    : null;

  const body = html`
    <div class="between mb-2">
      <div class="flex">${badge(m.membership_status)} <span class="muted small">${login ? 'has login' : 'no login'}</span></div>
      <div class="wrap-gap">
        <a href="${b}/members/${id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        <a href="${b}/contributions/new?member=${id}" class="btn btn-primary btn-sm">Record contribution</a>
        ${m.membership_status === 'inactive'
          ? html`<form method="post" action="${b}/members/${id}/reactivate"><button class="btn btn-ghost btn-sm">Reactivate</button></form>`
          : html`<form method="post" action="${b}/members/${id}/deactivate" onsubmit="return confirm('Deactivate this member?')"><button class="btn btn-ghost btn-sm link-danger">Deactivate</button></form>`}
      </div>
    </div>
    <div class="grid grid-2">
      ${card(html`<dl class="detail">
        <dt>Email</dt><dd>${m.email || '—'}</dd>
        <dt>Phone</dt><dd>${phones.join(', ') || '—'}</dd>
        <dt>Address</dt><dd>${[m.address_line1, m.address_line2, m.city, m.state, m.postal_code].filter(Boolean).join(', ') || '—'}</dd>
        <dt>Birthday</dt><dd>${m.dob_month ? `${MONTHS[m.dob_month]} ${m.dob_day}` : '—'}</dd>
        <dt>Anniversary</dt><dd>${m.anniversary_month ? `${MONTHS[m.anniversary_month]} ${m.anniversary_day}` : '—'}</dd>
        <dt>Family</dt><dd>${family ? html`<a href="${b}/families/${family.id}">${family.family_name}</a> ${m.family_role ? `(${m.family_role})` : ''}` : '—'}</dd>
      </dl>${m.notes ? html`<p class="small muted mt-2">${m.notes}</p>` : ''}`)}
      ${card(html`<div class="label muted small mb-2">Recent giving</div>
        ${contribs.length ? table([
          { head: 'Date', cell: (x) => x.date },
          { head: 'Amount', cell: (x) => formatMoney(x.amount, x.currency || cur) },
          { head: 'Category', cell: (x) => x.category || '—' },
          { head: 'Receipt', cell: (x) => x.receipt_number || '—' },
        ], contribs) : empty('No contributions recorded yet.')}`)}
    </div>
    ${notes !== null ? card(html`
      <div class="label muted small mb-2">Pastoral notes <span class="badge badge-muted">private</span></div>
      <form method="post" action="${b}/members/${id}/notes" class="mb-2">
        <textarea class="input" name="body" rows="2" placeholder="Add a private note…" required></textarea>
        <div class="mt-1"><button class="btn btn-primary btn-sm">Add note</button></div>
      </form>
      ${notes.length ? html`<div class="stack">${notes.map((n) => html`
        <div class="between" style="align-items:flex-start;gap:0.6rem;border-top:1px solid var(--line);padding-top:0.5rem">
          <div><div class="small">${n.body}</div>
            <div class="muted" style="font-size:0.75rem">${[n.first_name, n.last_name].filter(Boolean).join(' ') || 'Admin'} · ${fmtDateTime(n.created_at)}</div></div>
          <form method="post" action="${b}/members/${id}/notes/${n.id}/delete" onsubmit="return confirm('Delete this note?')"><button class="btn btn-ghost btn-sm link-danger">Delete</button></form>
        </div>`)}</div>` : html`<p class="muted small">No notes yet.</p>`}`, 'mt-2') : ''}`;
  return c.html(adminShell(ctx, '/members', fullName(m), body));
});

admin.post('/members/:id/notes', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  if (!ctx.settings.notes_enabled) return c.redirect(`${ctx.base}/admin/members/${id}`);
  const form = await c.req.parseBody();
  const bodyText = (form.body || '').toString().trim();
  if (bodyText) {
    await run(c.env.DB, 'INSERT INTO member_notes (church_id, member_id, body, created_by_id) VALUES (?, ?, ?, ?)', cid(c), id, bodyText, ctx.user.id);
    await audit(c, 'create', 'member_note', id);
  }
  return c.redirect(`${ctx.base}/admin/members/${id}`);
});

admin.post('/members/:id/notes/:noteId/delete', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  await run(c.env.DB, 'DELETE FROM member_notes WHERE church_id=? AND id=? AND member_id=?', cid(c), c.req.param('noteId'), id);
  await audit(c, 'delete', 'member_note', id);
  return c.redirect(`${ctx.base}/admin/members/${id}`);
});

admin.get('/members/:id/edit', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const m = await getMember(c.env.DB, churchId, id);
  if (!m) return c.notFound();
  const families = await listFamilies(c.env.DB, churchId);
  const values = { ...m, phones: parsePhones(m.phones).join(', ') };
  return c.html(adminShell(ctx, '/members', `Edit ${fullName(m)}`, memberForm(ctx, { values, families, action: `${ctx.base}/admin/members/${id}/edit`, submitLabel: 'Save changes' })));
});

admin.post('/members/:id/edit', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const form = await c.req.parseBody();
  const d = readMemberForm(form);
  if (!d.first_name || !d.last_name) {
    const families = await listFamilies(c.env.DB, churchId);
    return c.html(adminShell(ctx, '/members', 'Edit member', memberForm(ctx, { values: { ...d, id }, families, action: `${ctx.base}/admin/members/${id}/edit`, submitLabel: 'Save changes', error: 'First and last name are required.' })));
  }
  await updateMember(c.env.DB, churchId, id, d);
  await audit(c, 'update', 'member', id);
  return c.redirect(`${ctx.base}/admin/members/${id}`);
});

// --- Families --------------------------------------------------------------

admin.get('/families', async (c) => {
  const ctx = c.get('ctx');
  const rows = await listFamilies(c.env.DB, cid(c));
  const b = `${ctx.base}/admin`;
  const body = html`
    ${card(html`<form class="between" method="post" action="${b}/families" style="gap:0.6rem">
      <input class="input" name="family_name" placeholder="New family name" required />
      <button class="btn btn-primary btn-sm">Create family</button>
    </form>`)}
    <div class="mt-2">${table([
      { head: 'Family', cell: (f) => html`<a href="${b}/families/${f.id}">${f.family_name}</a>` },
      { head: 'Head', cell: (f) => [f.head_first, f.head_last].filter(Boolean).join(' ') || html`<span class="muted">—</span>` },
      { head: 'Members', cell: (f) => f.member_count },
    ], rows, 'No families yet.')}</div>`;
  return c.html(adminShell(ctx, '/families', 'Families', body));
});

admin.post('/families', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const name = (form.family_name || '').trim();
  if (name) {
    const fid = await createFamily(c.env.DB, churchId, name);
    await audit(c, 'create', 'family', fid);
    return c.redirect(`${ctx.base}/admin/families/${fid}`);
  }
  return c.redirect(`${ctx.base}/admin/families`);
});

admin.get('/families/:id', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const f = await getFamily(c.env.DB, churchId, id);
  if (!f) return c.notFound();
  const members = await familyMembers(c.env.DB, churchId, id);
  const b = `${ctx.base}/admin`;
  // Members not in this family, for the add dropdown.
  const others = await all(c.env.DB, `SELECT id, first_name, last_name FROM members
    WHERE church_id = ? AND (family_id IS NULL OR family_id != ?) ORDER BY last_name LIMIT 500`, churchId, id);

  const body = html`
    ${card(html`
      <form class="between" method="post" action="${b}/families/${id}/rename" style="gap:0.6rem">
        <input class="input" name="family_name" value="${f.family_name}" />
        <select class="input" name="head_member_id">
          <option value="">— head of household —</option>
          ${members.map((m) => html`<option value="${m.id}" ${raw(m.id === f.head_member_id ? 'selected' : '')}>${fullName(m)}</option>`)}
        </select>
        <button class="btn btn-ghost btn-sm">Save</button>
      </form>`)}

    <div class="mt-2">${table([
      { head: 'Member', cell: (m) => html`<a href="${b}/members/${m.id}">${fullName(m)}</a>` },
      { head: 'Role', cell: (m) => m.family_role || '—' },
      { head: '', cell: (m) => html`<form method="post" action="${b}/families/${id}/remove"><input type="hidden" name="member_id" value="${m.id}"/><button class="btn btn-ghost btn-sm link-danger">Remove</button></form>` },
    ], members, 'No members in this family yet.')}</div>

    ${others.length ? card(html`<div class="label muted small mb-2">Add a member</div>
      <form class="between" method="post" action="${b}/families/${id}/assign" style="gap:0.6rem">
        <select class="input" name="member_id" required>
          <option value="">Choose a member…</option>
          ${others.map((m) => html`<option value="${m.id}">${m.first_name} ${m.last_name}</option>`)}
        </select>
        <select class="input" name="role">${ROLES.map((r) => html`<option value="${r}">${cap(r)}</option>`)}</select>
        <button class="btn btn-primary btn-sm">Add</button>
      </form>`) : ''}`;
  return c.html(adminShell(ctx, '/families', f.family_name, body));
});

admin.post('/families/:id/rename', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const form = await c.req.parseBody();
  await updateFamily(c.env.DB, churchId, id, (form.family_name || '').trim() || 'Family', form.head_member_id || null);
  await audit(c, 'update', 'family', id);
  return c.redirect(`${ctx.base}/admin/families/${id}`);
});

admin.post('/families/:id/assign', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const form = await c.req.parseBody();
  if (form.member_id) {
    await assignFamily(c.env.DB, churchId, form.member_id, id, form.role || 'other');
    await audit(c, 'update', 'family', id, { added_member: form.member_id });
  }
  return c.redirect(`${ctx.base}/admin/families/${id}`);
});

admin.post('/families/:id/remove', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const id = c.req.param('id');
  const form = await c.req.parseBody();
  if (form.member_id) await assignFamily(c.env.DB, churchId, form.member_id, null, null);
  await audit(c, 'update', 'family', id, { removed_member: form.member_id });
  return c.redirect(`${ctx.base}/admin/families/${id}`);
});

// --- Reports ---------------------------------------------------------------

admin.get('/reports', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const cur = ctx.settings.currency;
  const year = parseInt(c.req.query('year'), 10) || new Date().getFullYear();

  const yr = await one(c.env.DB, `SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y',date)=? THEN amount END),0) AS this_year,
      COALESCE(SUM(CASE WHEN strftime('%Y',date)=? THEN amount END),0) AS last_year
    FROM contributions WHERE church_id=? AND is_deleted=0`, String(year), String(year - 1), churchId);
  const monthly = await all(c.env.DB, `SELECT strftime('%m',date) AS mm, SUM(amount) AS total
    FROM contributions WHERE church_id=? AND is_deleted=0 AND strftime('%Y',date)=? GROUP BY mm`, churchId, String(year));
  const byCat = await all(c.env.DB, `SELECT COALESCE(cc.name,'Uncategorized') AS name, SUM(ct.amount) AS total
    FROM contributions ct LEFT JOIN contribution_categories cc ON cc.id=ct.category_id
    WHERE ct.church_id=? AND ct.is_deleted=0 AND strftime('%Y',ct.date)=? GROUP BY ct.category_id ORDER BY total DESC`, churchId, String(year));
  const byMethod = await all(c.env.DB, `SELECT method, SUM(amount) AS total
    FROM contributions WHERE church_id=? AND is_deleted=0 AND strftime('%Y',date)=? GROUP BY method ORDER BY total DESC`, churchId, String(year));
  const members = await all(c.env.DB, "SELECT id, first_name, last_name FROM members WHERE church_id=? ORDER BY last_name LIMIT 2000", churchId);

  const monthTotals = Array(12).fill(0);
  for (const m of monthly) monthTotals[parseInt(m.mm, 10) - 1] = m.total;
  const b = `${ctx.base}/admin`;
  const years = []; for (let y = new Date().getFullYear(); y >= year - 5 && y >= 2015; y--) years.push(y);

  const body = html`
    ${toolbar(html`<form method="get" action="${b}/reports" class="toolbar" style="margin:0">
      <label class="label" style="margin:0">Year</label>
      <select class="input" name="year" onchange="this.form.submit()">
        ${[...new Set([year, ...years])].sort((a, z) => z - a).map((y) => html`<option value="${y}" ${raw(y === year ? 'selected' : '')}>${y}</option>`)}
      </select>
      <a href="${b}/contributions/export.csv" class="btn btn-ghost btn-sm" style="margin-left:auto">Export all as CSV</a>
    </form>`)}
    <div class="tiles mb-2">
      ${tile(`Given in ${year}`, formatMoney(yr.this_year, cur))}
      ${tile(`Given in ${year - 1}`, formatMoney(yr.last_year, cur))}
      ${tile('Change', pctChange(yr.last_year, yr.this_year))}
    </div>
    ${card(html`<div class="label muted small mb-2">Giving by month · ${year}</div>${barChart(monthTotals, cur)}`)}
    <div class="grid grid-2 mt-2">
      ${card(html`<div class="label muted small mb-2">By category</div>${breakdown(byCat.map((r) => [r.name, r.total]), cur)}`)}
      ${card(html`<div class="label muted small mb-2">By method</div>${breakdown(byMethod.map((r) => [METHOD_LABEL(r.method), r.total]), cur)}`)}
    </div>
    ${card(html`<div class="label muted small mb-2">Generate a member statement</div>
      <form method="get" action="${b}/reports/statement" class="toolbar" style="margin:0;flex-wrap:wrap">
        <select class="input" name="member" required><option value="">Choose a member…</option>
          ${members.map((m) => html`<option value="${m.id}">${m.last_name}, ${m.first_name}</option>`)}</select>
        <select class="input" name="type"><option value="annual">Annual</option><option value="monthly">Monthly</option></select>
        <input class="input" type="number" name="year" value="${year}" style="width:6rem" />
        <input class="input" type="number" name="month" value="1" min="1" max="12" style="width:5rem" title="Month (for monthly)" />
        <button class="btn btn-primary btn-sm">Download PDF</button>
      </form>`)}`;
  return c.html(adminShell(ctx, '/reports', 'Reports', body));
});

admin.get('/reports/statement', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const memberId = c.req.query('member');
  const member = memberId && await getMember(c.env.DB, churchId, memberId);
  if (!member) return c.text('Member not found', 404);
  const type = c.req.query('type') === 'monthly' ? 'monthly' : 'annual';
  const year = parseInt(c.req.query('year'), 10) || new Date().getFullYear();
  const month = parseInt(c.req.query('month'), 10) || 1;
  member._currency = ctx.settings.currency;
  const bytes = await getOrBuildStatement(c.env, ctx.settings, member, { type, year, month });
  await audit(c, 'export', 'report', member.id, { type, year, month, by_admin: true });
  const fname = type === 'annual' ? `${member.last_name}-${year}-statement.pdf` : `${member.last_name}-${year}-${String(month).padStart(2, '0')}.pdf`;
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fname}"` } });
});

// --- Users (super admin) ---------------------------------------------------

admin.get('/users', requireSuperAdmin, async (c) => {
  const ctx = c.get('ctx');
  const rows = await all(c.env.DB, `SELECT u.*, m.first_name AS mf, m.last_name AS ml FROM users u
    LEFT JOIN members m ON m.id = u.member_id WHERE u.church_id = ? ORDER BY u.is_admin DESC, u.last_name, u.email`, cid(c));
  const b = `${ctx.base}/admin/users`;
  const body = table([
    { head: 'Name', cell: (u) => `${u.first_name || u.mf || ''} ${u.last_name || u.ml || ''}`.trim() || '—' },
    { head: 'Email', cell: (u) => u.email },
    { head: 'Role', cell: (u) => u.is_admin ? html`<span class="badge badge-ok">admin${u.can_manage_admins ? ' · owner' : ''}</span>` : html`<span class="badge badge-muted">member</span>` },
    { head: 'Status', cell: (u) => badge(u.is_active ? 'active' : 'inactive') },
    { head: 'Last login', cell: (u) => u.last_login ? fmtWhen(u.last_login) : '—' },
    { head: '', cell: (u) => u.can_manage_admins ? html`<span class="muted small">—</span>` : html`<div class="wrap-gap">
        ${u.is_admin
          ? html`<form method="post" action="${b}/${u.id}/revoke"><button class="btn btn-ghost btn-sm">Revoke admin</button></form>`
          : html`<form method="post" action="${b}/${u.id}/promote"><button class="btn btn-ghost btn-sm">Make admin</button></form>`}
        ${u.is_active
          ? html`<form method="post" action="${b}/${u.id}/deactivate"><button class="btn btn-ghost btn-sm link-danger">Deactivate</button></form>`
          : html`<form method="post" action="${b}/${u.id}/reactivate"><button class="btn btn-ghost btn-sm">Reactivate</button></form>`}
      </div>` },
  ], rows);
  return c.html(adminShell(ctx, '/users', 'Users', body));
});

const userAction = (col, val, action) => async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  // Never let an admin change the owner account.
  const u = await one(c.env.DB, 'SELECT can_manage_admins FROM users WHERE church_id=? AND id=?', cid(c), id);
  if (u && !u.can_manage_admins) {
    await run(c.env.DB, `UPDATE users SET ${col}=? WHERE church_id=? AND id=?`, val, cid(c), id);
    await audit(c, action, 'user', id);
  }
  return c.redirect(`${ctx.base}/admin/users`);
};
admin.post('/users/:id/promote', requireSuperAdmin, userAction('is_admin', 1, 'promote'));
admin.post('/users/:id/revoke', requireSuperAdmin, userAction('is_admin', 0, 'revoke'));
admin.post('/users/:id/deactivate', requireSuperAdmin, userAction('is_active', 0, 'update'));
admin.post('/users/:id/reactivate', requireSuperAdmin, userAction('is_active', 1, 'update'));

// --- Audit log -------------------------------------------------------------

admin.get('/audit', async (c) => {
  const ctx = c.get('ctx');
  const rows = await all(c.env.DB, `SELECT a.*, u.first_name, u.last_name, u.email FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id WHERE a.church_id = ? ORDER BY a.created_at DESC LIMIT 200`, cid(c));
  const body = table([
    { head: 'When', cell: (r) => fmtDateTime(r.created_at) },
    { head: 'Who', cell: (r) => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'system' },
    { head: 'Action', cell: (r) => r.action },
    { head: 'Entity', cell: (r) => [r.entity_type, r.entity_id].filter(Boolean).join(' #') || '—' },
    { head: 'Details', cell: (r) => html`<span class="small muted">${r.details || ''}</span>` },
  ], rows, 'No activity logged yet.');
  return c.html(adminShell(ctx, '/audit', 'Audit log', body));
});

// --- Email log -------------------------------------------------------------

admin.get('/emails', async (c) => {
  const ctx = c.get('ctx');
  const rows = await all(c.env.DB, 'SELECT * FROM email_logs WHERE church_id = ? ORDER BY id DESC LIMIT 200', cid(c));
  const body = table([
    { head: 'When', cell: (r) => fmtDateTime(r.sent_at || r.created_at) },
    { head: 'Type', cell: (r) => (r.email_type || '').replace('_', ' ') },
    { head: 'To', cell: (r) => r.recipient_email || '—' },
    { head: 'Subject', cell: (r) => html`<span class="small">${r.subject || ''}</span>` },
    { head: 'Status', cell: (r) => emailStatus(r.status) },
  ], rows, 'No emails sent yet.');
  return c.html(adminShell(ctx, '/settings', 'Email log', html`
    <p class="small"><a href="${ctx.base}/admin/settings/email">← Email settings</a></p>${body}`));
});

// --- Data export (owner only) ----------------------------------------------

admin.get('/export.json', requireSuperAdmin, async (c) => {
  const churchId = cid(c);
  const dump = async (sql, ...p) => (await c.env.DB.prepare(sql).bind(...p).all()).results || [];
  const data = {
    exported_at: new Date().toISOString(),
    church: await one(c.env.DB, 'SELECT * FROM churches WHERE id = ?', churchId),
    // Exclude stored secrets (Resend / Turnstile keys) from the backup.
    settings: await one(c.env.DB, `SELECT id, church_id, church_logo_key, primary_color,
      church_address_line1, church_address_line2, church_city, church_state, church_zip,
      church_country, church_phone, church_email, church_website, ein_tax_id, currency,
      timezone, date_format, default_from_email, reply_to_email, thankyou_subject_template,
      thankyou_intro_text, email_image_url, missions_enabled, pledges_enabled, groups_enabled,
      attendance_enabled, notes_enabled, created_at, updated_at
      FROM church_settings WHERE church_id = ?`, churchId),
    members: await dump('SELECT * FROM members WHERE church_id = ?', churchId),
    families: await dump('SELECT * FROM families WHERE church_id = ?', churchId),
    users: await dump('SELECT id, email, first_name, last_name, is_admin, can_manage_admins, is_active, member_id, last_login, created_at FROM users WHERE church_id = ?', churchId),
    categories: await dump('SELECT * FROM contribution_categories WHERE church_id = ?', churchId),
    contributions: await dump('SELECT * FROM contributions WHERE church_id = ?', churchId),
    bible_verses: await dump('SELECT * FROM bible_verses WHERE church_id = ?', churchId),
    pledges: await dump('SELECT * FROM pledges WHERE church_id = ?', churchId),
    groups: await dump('SELECT * FROM member_groups WHERE church_id = ?', churchId),
    group_memberships: await dump('SELECT * FROM group_memberships WHERE church_id = ?', churchId),
    attendance: await dump('SELECT * FROM attendance WHERE church_id = ?', churchId),
    mission_sites: await dump('SELECT * FROM mission_sites WHERE church_id = ?', churchId),
    mission_support: await dump('SELECT * FROM mission_support WHERE church_id = ?', churchId),
    email_logs: await dump('SELECT * FROM email_logs WHERE church_id = ?', churchId),
  };
  await audit(c, 'export', 'church', churchId, { full_backup: true });
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="gracedesk-${ctx0(c)}-${new Date().toISOString().slice(0, 10)}.json"` },
  });
});
function ctx0(c) { return (c.get('ctx').church.slug || 'export'); }

function emailStatus(status) {
  const map = { sent: 'ok', delivered: 'ok', opened: 'ok', queued: 'muted', skipped: 'muted', failed: 'warn', bounced: 'warn', complained: 'warn' };
  return html`<span class="badge badge-${map[status] || 'muted'}">${status || 'queued'}</span>`;
}

// --- helpers ---------------------------------------------------------------

const METHOD_LABEL = (m) => ({ cash: 'Cash', check: 'Check', zelle: 'Zelle', bank_transfer: 'Bank transfer', zeffy: 'Zeffy', stripe: 'Stripe', paypal: 'PayPal', other: 'Other' }[m] || m);

function pctChange(prev, cur) {
  if (!prev) return cur ? 'New' : '—';
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p >= 0 ? '+' : ''}${p}%`;
}

function barChart(values, currency) {
  const max = Math.max(1, ...values);
  const W = 640, H = 160, pad = 24, bw = (W - pad * 2) / 12;
  const labels = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  return html`<div class="table-wrap" style="border:none;background:none;overflow-x:auto">
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:640px" role="img" aria-label="Giving by month">
      ${raw(values.map((v, i) => {
        const h = Math.round((v / max) * (H - pad * 2));
        const x = pad + i * bw + 3;
        const yTop = H - pad - h;
        return `<rect x="${x}" y="${yTop}" width="${bw - 6}" height="${h}" rx="2" fill="var(--brand)" opacity="0.9"><title>${labels[i]}: ${formatMoney(v, currency)}</title></rect>
          <text x="${x + (bw - 6) / 2}" y="${H - 8}" font-size="9" fill="#6d675e" text-anchor="middle">${labels[i]}</text>`;
      }).join(''))}
    </svg></div>`;
}

function breakdown(pairs, currency) {
  if (!pairs.length || pairs.every(([, v]) => !v)) return empty('No giving recorded.');
  const total = pairs.reduce((s, [, v]) => s + v, 0) || 1;
  return html`<div class="stack">${pairs.map(([name, v]) => html`
    <div>
      <div class="between" style="margin-bottom:2px"><span class="small">${name}</span><span class="small muted">${formatMoney(v, currency)}</span></div>
      <div style="height:6px;background:#eee7db;border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round((v / total) * 100)}%;background:var(--brand)"></div></div>
    </div>`)}</div>`;
}

function tile(label, value, href) {
  const inner = html`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  return href ? html`<a class="card" href="${href}" style="text-decoration:none">${inner}</a>` : card(inner);
}

function readMemberForm(form) {
  const num = (v) => (v ? parseInt(v, 10) : null);
  const phones = (form.phones || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    first_name: (form.first_name || '').trim(),
    middle_name: (form.middle_name || '').trim(),
    last_name: (form.last_name || '').trim(),
    email: (form.email || '').trim().toLowerCase(),
    phones,
    dob_month: num(form.dob_month), dob_day: num(form.dob_day),
    anniversary_month: num(form.anniversary_month), anniversary_day: num(form.anniversary_day),
    address_line1: (form.address_line1 || '').trim(),
    address_line2: (form.address_line2 || '').trim(),
    city: (form.city || '').trim(), state: (form.state || '').trim(),
    postal_code: (form.postal_code || '').trim(), country: (form.country || '').trim(),
    family_id: form.family_id || null, family_role: form.family_role || null,
    notes: (form.notes || '').trim(),
  };
}

function memberForm(ctx, { values = {}, families = [], action, submitLabel, isNew = false, error }) {
  const v = values;
  const monthSel = (name, val) => html`<select class="input" name="${name}"><option value="">Month</option>
    ${MONTHS.slice(1).map((m, i) => html`<option value="${i + 1}" ${raw((i + 1) === Number(val) ? 'selected' : '')}>${m}</option>`)}</select>`;
  return card(html`
    <form method="post" action="${action}">
      ${error ? alertBox('error', error) : ''}
      <div class="row">
        <div>${field({ label: 'First name', name: 'first_name', value: v.first_name || '', required: true })}</div>
        <div>${field({ label: 'Last name', name: 'last_name', value: v.last_name || '', required: true })}</div>
      </div>
      ${field({ label: 'Middle name', name: 'middle_name', value: v.middle_name || '' })}
      ${field({ label: 'Email', name: 'email', type: 'email', value: v.email || '' })}
      ${field({ label: 'Phone(s)', name: 'phones', value: v.phones || '', hint: 'Comma-separated for more than one' })}
      <div class="row">
        <label class="field"><span class="label">Birthday</span><div class="flex">${monthSel('dob_month', v.dob_month)}<input class="input" name="dob_day" value="${v.dob_day || ''}" placeholder="Day" style="width:5rem" /></div></label>
        <label class="field"><span class="label">Anniversary</span><div class="flex">${monthSel('anniversary_month', v.anniversary_month)}<input class="input" name="anniversary_day" value="${v.anniversary_day || ''}" placeholder="Day" style="width:5rem" /></div></label>
      </div>
      ${field({ label: 'Address line 1', name: 'address_line1', value: v.address_line1 || '' })}
      ${field({ label: 'Address line 2', name: 'address_line2', value: v.address_line2 || '' })}
      <div class="row">
        <div>${field({ label: 'City', name: 'city', value: v.city || '' })}</div>
        <div>${field({ label: 'State', name: 'state', value: v.state || '' })}</div>
      </div>
      <div class="row">
        <div>${field({ label: 'ZIP / Postal', name: 'postal_code', value: v.postal_code || '' })}</div>
        <div>${field({ label: 'Country', name: 'country', value: v.country || '' })}</div>
      </div>
      <label class="field"><span class="label">Family</span>
        <select class="input" name="family_id">
          <option value="">— none —</option>
          ${families.map((f) => html`<option value="${f.id}" ${raw(String(f.id) === String(v.family_id) ? 'selected' : '')}>${f.family_name}</option>`)}
        </select></label>
      <label class="field"><span class="label">Family role</span>
        <select class="input" name="family_role">
          <option value="">—</option>
          ${ROLES.map((r) => html`<option value="${r}" ${raw(r === v.family_role ? 'selected' : '')}>${cap(r)}</option>`)}
        </select></label>
      <label class="field"><span class="label">Notes (admin only)</span>
        <textarea class="input" name="notes" rows="2">${v.notes || ''}</textarea></label>
      ${isNew ? html`<label class="flex small" style="margin:0.3rem 0 0.8rem"><input type="checkbox" name="create_login" /> Create a login and email an invitation to set a password</label>` : ''}
      ${submitBtn(submitLabel)}
    </form>`);
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
