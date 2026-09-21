import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { all } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { adminShell, badge, table, toolbar, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { sendEmail, emailShell } from '../services/email.js';
import { formatMoney } from '../services/settings.js';
import { fullName, getMember } from '../services/members.js';
import {
  METHODS, METHOD_LABELS, activeCategories, createContribution, getContribution,
  updateContribution, softDeleteContribution, listContributions, randomVerse,
} from '../services/contributions.js';

export const adminContributions = new Hono();
adminContributions.use('*', requireAdmin);

const cid = (c) => c.get('ctx').church.id;
const today = () => new Date().toISOString().slice(0, 10);

async function activeMembers(db, churchId) {
  return all(db, "SELECT id, first_name, last_name FROM members WHERE church_id = ? AND membership_status != 'inactive' ORDER BY last_name, first_name LIMIT 2000", churchId);
}

// --- List ------------------------------------------------------------------

adminContributions.get('/', async (c) => {
  const ctx = c.get('ctx');
  const f = {
    q: c.req.query('q') || '', method: c.req.query('method') || '',
    categoryId: c.req.query('category') || '', from: c.req.query('from') || '', to: c.req.query('to') || '',
  };
  const rows = await listContributions(c.env.DB, cid(c), f);
  const cats = await activeCategories(c.env.DB, cid(c));
  const cur = ctx.settings.currency;
  const b = `${ctx.base}/admin/contributions`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))).toString();

  const body = html`
    ${toolbar(html`
      <form class="toolbar" method="get" action="${b}" style="margin:0;flex-wrap:wrap">
        <input class="input" type="search" name="q" value="${f.q}" placeholder="Name or receipt" />
        <select class="input" name="method"><option value="">All methods</option>
          ${METHODS.map((m) => html`<option value="${m}" ${raw(m === f.method ? 'selected' : '')}>${METHOD_LABELS[m]}</option>`)}</select>
        <select class="input" name="category"><option value="">All categories</option>
          ${cats.map((cat) => html`<option value="${cat.id}" ${raw(String(cat.id) === f.categoryId ? 'selected' : '')}>${cat.name}</option>`)}</select>
        <input class="input" type="date" name="from" value="${f.from}" />
        <input class="input" type="date" name="to" value="${f.to}" />
        <button class="btn btn-ghost btn-sm">Filter</button>
      </form>
      <div class="wrap-gap" style="margin-left:auto">
        <a href="${b}/export.csv${qs ? '?' + qs : ''}" class="btn btn-ghost btn-sm">Export CSV</a>
        <a href="${b}/new" class="btn btn-primary btn-sm">Record contribution</a>
      </div>`)}
    <p class="muted small mb-2">${rows.length} contribution(s) · total ${formatMoney(total, cur)}</p>
    ${table([
      { head: 'Date', cell: (r) => r.date },
      { head: 'Member', cell: (r) => html`<a href="${ctx.base}/admin/contributions/${r.id}">${[r.first_name, r.last_name].filter(Boolean).join(' ')}</a>` },
      { head: 'Amount', cell: (r) => formatMoney(r.amount, r.currency || cur) },
      { head: 'Method', cell: (r) => METHOD_LABELS[r.method] || r.method },
      { head: 'Category', cell: (r) => r.category || '—' },
      { head: 'Receipt', cell: (r) => r.receipt_number || '—' },
    ], rows, 'No contributions recorded yet.')}`;
  return c.html(adminShell(ctx, '/contributions', 'Contributions', body));
});

// CSV export.
adminContributions.get('/export.csv', async (c) => {
  const ctx = c.get('ctx');
  const rows = await listContributions(c.env.DB, cid(c), {
    q: c.req.query('q') || '', method: c.req.query('method') || '', categoryId: c.req.query('category') || '',
    from: c.req.query('from') || '', to: c.req.query('to') || '',
  });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Date', 'Member', 'Amount', 'Currency', 'Method', 'Category', 'Receipt', 'Notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.date, `${r.first_name} ${r.last_name}`, r.amount, r.currency, r.method, r.category || '', r.receipt_number || '', r.notes || ''].map(esc).join(','));
  }
  await audit(c, 'export', 'contribution', null, { count: rows.length });
  return new Response(lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="contributions-${today()}.csv"` },
  });
});

// --- Record (fill -> confirm -> save) --------------------------------------

adminContributions.get('/new', async (c) => {
  const ctx = c.get('ctx');
  const members = await activeMembers(c.env.DB, cid(c));
  const cats = await activeCategories(c.env.DB, cid(c));
  const preMember = c.req.query('member') || '';
  return c.html(adminShell(ctx, '/contributions', 'Record contribution',
    contributionForm(ctx, { members, cats, values: { member_id: preMember, date: today() } })));
});

adminContributions.post('/new', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const d = readForm(form);
  const members = await activeMembers(c.env.DB, cid(c));
  const cats = await activeCategories(c.env.DB, cid(c));
  const err = validate(d);
  if (err) {
    return c.html(adminShell(ctx, '/contributions', 'Record contribution',
      contributionForm(ctx, { members, cats, values: d, error: err })));
  }
  // Confirmation step.
  const member = await getMember(c.env.DB, cid(c), d.member_id);
  const cat = cats.find((x) => String(x.id) === String(d.category_id));
  const b = `${ctx.base}/admin/contributions`;
  const body = card(html`
    <h2 style="font-size:1.15rem">Confirm this contribution</h2>
    <dl class="detail mt-1">
      <dt>Member</dt><dd>${member ? fullName(member) : '—'}</dd>
      <dt>Amount</dt><dd>${formatMoney(d.amount, ctx.settings.currency)}</dd>
      <dt>Date</dt><dd>${d.date}</dd>
      <dt>Method</dt><dd>${METHOD_LABELS[d.method]}</dd>
      <dt>Category</dt><dd>${cat ? cat.name : '—'}</dd>
      ${d.notes ? html`<dt>Notes</dt><dd>${d.notes}</dd>` : ''}
    </dl>
    <form method="post" action="${b}" class="wrap-gap mt-2">
      ${hidden(d)}
      <button class="btn btn-primary">Save and send thank-you</button>
      <a href="${b}/new" class="btn btn-ghost">Edit</a>
    </form>`);
  return c.html(adminShell(ctx, '/contributions', 'Confirm', body));
});

adminContributions.post('/', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const d = readForm(form);
  const err = validate(d);
  if (err) return c.redirect(`${ctx.base}/admin/contributions/new`);
  d.currency = ctx.settings.currency;
  d.entered_by_id = ctx.user.id;
  const { id, receipt } = await createContribution(c.env.DB, churchId, d);
  await audit(c, 'create', 'contribution', id, { receipt, amount: d.amount });

  // Thank-you email with a random verse.
  const member = await getMember(c.env.DB, churchId, d.member_id);
  let emailNote = 'No email on file, so no thank-you was sent.';
  if (member?.email) {
    const verse = await randomVerse(c.env.DB, churchId);
    const res = await sendEmail(c.env, ctx.settings, {
      to: member.email, type: 'thank_you', memberId: member.id, contributionId: id,
      verseUsed: verse ? `${verse.reference}` : null,
      subject: (ctx.settings.thankyou_subject_template || 'Thank you for your contribution').replace('{church_name}', ctx.settings.church_name),
      html: emailShell(ctx.settings, `
        <p>Dear ${member.first_name},</p>
        <p>${ctx.settings.thankyou_intro_text || 'Thank you for your generous contribution.'}</p>
        <table style="margin:14px 0;font-size:14px">
          <tr><td style="color:#64748b;padding:2px 12px 2px 0">Amount</td><td><strong>${formatMoney(d.amount, ctx.settings.currency)}</strong></td></tr>
          <tr><td style="color:#64748b;padding:2px 12px 2px 0">Date</td><td>${d.date}</td></tr>
          <tr><td style="color:#64748b;padding:2px 12px 2px 0">Receipt</td><td>${receipt}</td></tr>
        </table>
        ${verse ? `<blockquote style="border-left:3px solid ${ctx.settings.primary_color};margin:16px 0;padding:4px 0 4px 14px;color:#334155;font-style:italic">"${verse.text}"<br/><span style="font-style:normal;color:#64748b">— ${verse.reference}</span></blockquote>` : ''}`),
    });
    emailNote = res.ok ? 'A thank-you email was sent.' : 'Email is not configured, so no thank-you was sent.';
  }

  const b = `${ctx.base}/admin/contributions`;
  const body = card(html`
    ${alertBox('success', `Saved. Receipt ${receipt}.`)}
    <p class="muted small">${emailNote}</p>
    <div class="wrap-gap mt-2">
      <a href="${b}/new" class="btn btn-primary btn-sm">Record another</a>
      <a href="${b}/${id}" class="btn btn-ghost btn-sm">View</a>
      <a href="${b}" class="btn btn-ghost btn-sm">All contributions</a>
    </div>`);
  return c.html(adminShell(ctx, '/contributions', 'Saved', body));
});

// --- Detail / edit / delete ------------------------------------------------

adminContributions.get('/:id', async (c) => {
  const ctx = c.get('ctx');
  const ct = await getContribution(c.env.DB, cid(c), c.req.param('id'));
  if (!ct) return c.notFound();
  const b = `${ctx.base}/admin/contributions`;
  const body = html`
    <div class="between mb-2">
      ${ct.is_deleted ? badge('inactive') : html`<span class="badge badge-ok">recorded</span>`}
      <div class="wrap-gap">
        ${!ct.is_deleted ? html`<a href="${b}/${ct.id}/edit" class="btn btn-ghost btn-sm">Edit</a>` : ''}
        ${!ct.is_deleted ? html`
          <form method="post" action="${b}/${ct.id}/delete" onsubmit="return confirmDelete(this)">
            <input type="hidden" name="reason" value="" />
            <button class="btn btn-ghost btn-sm link-danger">Delete</button>
          </form>` : ''}
      </div>
    </div>
    ${card(html`<dl class="detail">
      <dt>Member</dt><dd><a href="${ctx.base}/admin/members/${ct.member_id}">${[ct.first_name, ct.last_name].filter(Boolean).join(' ')}</a></dd>
      <dt>Amount</dt><dd>${formatMoney(ct.amount, ct.currency || ctx.settings.currency)}</dd>
      <dt>Date</dt><dd>${ct.date}</dd>
      <dt>Method</dt><dd>${METHOD_LABELS[ct.method] || ct.method}</dd>
      <dt>Category</dt><dd>${ct.category || '—'}</dd>
      <dt>Receipt</dt><dd>${ct.receipt_number || '—'}</dd>
      ${ct.notes ? html`<dt>Notes</dt><dd>${ct.notes}</dd>` : ''}
      ${ct.is_deleted ? html`<dt>Deleted</dt><dd>${ct.deleted_reason || ''}</dd>` : ''}
    </dl>`)}
    <script>function confirmDelete(f){var r=prompt('Reason for deleting this contribution?');if(r===null)return false;f.reason.value=r;return true;}</script>`;
  return c.html(adminShell(ctx, '/contributions', `Receipt ${ct.receipt_number || ''}`, body));
});

adminContributions.get('/:id/edit', async (c) => {
  const ctx = c.get('ctx');
  const ct = await getContribution(c.env.DB, cid(c), c.req.param('id'));
  if (!ct) return c.notFound();
  const members = await activeMembers(c.env.DB, cid(c));
  const cats = await activeCategories(c.env.DB, cid(c));
  return c.html(adminShell(ctx, '/contributions', 'Edit contribution',
    contributionForm(ctx, { members, cats, values: ct, action: `${ctx.base}/admin/contributions/${ct.id}/edit`, submitLabel: 'Save changes' })));
});

adminContributions.post('/:id/edit', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  const form = await c.req.parseBody();
  const d = readForm(form);
  const err = validate(d);
  if (err) {
    const members = await activeMembers(c.env.DB, cid(c));
    const cats = await activeCategories(c.env.DB, cid(c));
    return c.html(adminShell(ctx, '/contributions', 'Edit contribution',
      contributionForm(ctx, { members, cats, values: { ...d, id }, action: `${ctx.base}/admin/contributions/${id}/edit`, submitLabel: 'Save changes', error: err })));
  }
  await updateContribution(c.env.DB, cid(c), id, d);
  await audit(c, 'update', 'contribution', id);
  return c.redirect(`${ctx.base}/admin/contributions/${id}`);
});

adminContributions.post('/:id/delete', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  const form = await c.req.parseBody();
  await softDeleteContribution(c.env.DB, cid(c), id, (form.reason || '').toString(), ctx.user.id);
  await audit(c, 'delete', 'contribution', id, { reason: form.reason || '' });
  return c.redirect(`${ctx.base}/admin/contributions`);
});

// --- helpers ---------------------------------------------------------------

function readForm(form) {
  return {
    member_id: form.member_id || '',
    amount: parseFloat(form.amount) || 0,
    date: (form.date || '').toString() || today(),
    method: form.method || 'cash',
    category_id: form.category_id || '',
    notes: (form.notes || '').toString().trim(),
  };
}

function validate(d) {
  if (!d.member_id) return 'Please choose a member.';
  if (!(d.amount > 0)) return 'Please enter an amount greater than zero.';
  if (!d.date) return 'Please choose a date.';
  return null;
}

function hidden(d) {
  return html`
    <input type="hidden" name="member_id" value="${d.member_id}" />
    <input type="hidden" name="amount" value="${d.amount}" />
    <input type="hidden" name="date" value="${d.date}" />
    <input type="hidden" name="method" value="${d.method}" />
    <input type="hidden" name="category_id" value="${d.category_id}" />
    <input type="hidden" name="notes" value="${d.notes || ''}" />`;
}

function contributionForm(ctx, { members, cats, values = {}, action, submitLabel, error }) {
  const v = values;
  const a = action || `${ctx.base}/admin/contributions/new`;
  const isConfirmStep = !action; // /new posts to confirm
  return card(html`
    <form method="post" action="${a}">
      ${error ? alertBox('error', error) : ''}
      <label class="field"><span class="label">Member <span class="req">*</span></span>
        <select class="input" name="member_id" required>
          <option value="">Choose a member…</option>
          ${members.map((m) => html`<option value="${m.id}" ${raw(String(m.id) === String(v.member_id) ? 'selected' : '')}>${m.last_name}, ${m.first_name}</option>`)}
        </select>
        <span class="hint"><a href="${ctx.base}/admin/members/new" target="_blank">Add a new member</a> if they are not listed.</span>
      </label>
      <div class="row">
        <label class="field"><span class="label">Amount (${ctx.settings.currency}) <span class="req">*</span></span>
          <input class="input" type="number" step="0.01" min="0" name="amount" value="${v.amount || ''}" required /></label>
        <div>${field({ label: 'Date', name: 'date', type: 'date', value: v.date || today(), required: true })}</div>
      </div>
      <div class="row">
        <label class="field"><span class="label">Method</span>
          <select class="input" name="method">
            ${METHODS.map((m) => html`<option value="${m}" ${raw(m === v.method ? 'selected' : '')}>${METHOD_LABELS[m]}</option>`)}
          </select></label>
        <label class="field"><span class="label">Category</span>
          <select class="input" name="category_id">
            <option value="">—</option>
            ${cats.map((cat) => html`<option value="${cat.id}" ${raw(String(cat.id) === String(v.category_id) ? 'selected' : '')}>${cat.name}</option>`)}
          </select></label>
      </div>
      <label class="field"><span class="label">Notes</span><textarea class="input" name="notes" rows="2">${v.notes || ''}</textarea></label>
      ${submitBtn(submitLabel || 'Continue')}
    </form>`);
}
