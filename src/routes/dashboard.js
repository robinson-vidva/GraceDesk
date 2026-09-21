import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { layout, card } from '../views/layout.js';
import { table, empty } from '../views/admin.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { requireAuth } from '../middleware.js';
import { one } from '../db.js';
import { audit } from '../services/audit.js';
import { formatMoney } from '../services/settings.js';
import { getMember, getFamily, familyMembers, updateMember, fullName, parsePhones } from '../services/members.js';
import {
  memberContributions, memberTotals, listContributions, METHOD_LABELS,
} from '../services/contributions.js';
import { getOrBuildStatement } from '../services/pdf.js';

export const dashboard = new Hono();

const cid = (c) => c.get('ctx').church.id;
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function currentMember(c) {
  const { user, church } = c.get('ctx');
  if (!user.member_id) return null;
  return getMember(c.env.DB, church.id, user.member_id);
}

async function isFamilyHead(db, churchId, member) {
  if (!member?.family_id) return false;
  const fam = await getFamily(db, churchId, member.family_id);
  return fam && (fam.head_member_id === member.id || member.family_role === 'head');
}

// --- Dashboard -------------------------------------------------------------

dashboard.get('/dashboard', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const b = ctx.base;
  const member = await currentMember(c);
  const cur = ctx.settings.currency;

  let totals = { year: 0, month: 0 };
  let recent = [];
  if (member) {
    totals = await memberTotals(c.env.DB, cid(c), member.id);
    recent = (await memberContributions(c.env.DB, cid(c), member.id)).slice(0, 5);
  }

  const body = html`
    <h1 style="font-size:1.7rem;margin-bottom:0.1rem">Welcome, ${ctx.user.first_name || 'friend'}</h1>
    <p class="muted" style="margin-top:0">${ctx.settings.church_name}</p>

    ${member ? html`
      <div class="grid grid-2 mt-2 mb-2">
        ${card(html`<div class="stat"><div class="label">Given this year</div><div class="value">${formatMoney(totals.year, cur)}</div></div>`)}
        ${card(html`<div class="stat"><div class="label">Given this month</div><div class="value">${formatMoney(totals.month, cur)}</div></div>`)}
      </div>
      ${card(html`
        <div class="between mb-2"><div class="label muted small">Recent giving</div><a class="small" href="${b}/contributions">View all</a></div>
        ${recent.length ? table([
          { head: 'Date', cell: (x) => x.date },
          { head: 'Amount', cell: (x) => formatMoney(x.amount, x.currency || cur) },
          { head: 'Category', cell: (x) => x.category || '—' },
          { head: 'Receipt', cell: (x) => x.receipt_number || '—' },
        ], recent) : empty('No contributions recorded yet.')}`)}
      <div class="wrap-gap mt-2">
        <a href="${b}/reports" class="btn btn-primary btn-sm">Download a statement</a>
        <a href="${b}/profile" class="btn btn-ghost btn-sm">Edit my profile</a>
      </div>`
    : html`${card(html`<p class="muted small">Your login isn't linked to a giving record yet. An administrator can link it.</p>
        <div class="wrap-gap mt-2">${ctx.user.is_admin ? html`<a href="${b}/admin" class="btn btn-primary btn-sm">Go to admin</a>` : ''}
        <a href="${b}/profile" class="btn btn-ghost btn-sm">My profile</a></div>`)}`}`;
  return c.html(layout({ ...ctx, title: 'Dashboard' }, body));
});

// --- My contributions ------------------------------------------------------

dashboard.get('/contributions', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const member = await currentMember(c);
  const cur = ctx.settings.currency;
  if (!member) return c.html(layout({ ...ctx, title: 'My giving' }, card(html`<p class="muted small">No giving record is linked to your account.</p>`)));

  const head = await isFamilyHead(c.env.DB, cid(c), member);
  const view = head && c.req.query('view') === 'family' ? 'family' : 'mine';
  const year = c.req.query('year') || '';
  const b = ctx.base;

  let rows;
  let title = 'My giving';
  if (view === 'family') {
    const fam = await familyMembers(c.env.DB, cid(c), member.family_id);
    const ids = fam.map((m) => m.id);
    const nameById = Object.fromEntries(fam.map((m) => [m.id, fullName(m)]));
    const allRows = await listContributions(c.env.DB, cid(c), {});
    rows = allRows.filter((r) => ids.includes(r.member_id) && (!year || r.date.startsWith(year)))
      .map((r) => ({ ...r, _member: nameById[r.member_id] || '' }));
    title = 'Family giving';
  } else {
    rows = await memberContributions(c.env.DB, cid(c), member.id, { year });
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);

  const cols = [
    ...(view === 'family' ? [{ head: 'Member', cell: (x) => x._member }] : []),
    { head: 'Date', cell: (x) => x.date },
    { head: 'Amount', cell: (x) => formatMoney(x.amount, x.currency || cur) },
    { head: 'Method', cell: (x) => METHOD_LABELS[x.method] || x.method },
    { head: 'Category', cell: (x) => x.category || '—' },
    { head: 'Receipt', cell: (x) => x.receipt_number || '—' },
  ];

  const body = html`
    <div class="between mb-2">
      <h1 style="font-size:1.5rem;margin:0">${title}</h1>
      ${head ? html`<div class="wrap-gap">
        <a href="${b}/contributions" class="btn ${view === 'mine' ? 'btn-primary' : 'btn-ghost'} btn-sm">Mine</a>
        <a href="${b}/contributions?view=family" class="btn ${view === 'family' ? 'btn-primary' : 'btn-ghost'} btn-sm">Family</a>
      </div>` : ''}
    </div>
    <p class="muted small mb-2">${rows.length} contribution(s) · total ${formatMoney(total, cur)}</p>
    ${table(cols, rows, 'No contributions to show.')}
    <p class="small mt-2"><a href="${b}/reports">Download a statement →</a></p>`;
  return c.html(layout({ ...ctx, title }, body));
});

// --- Reports (download statements) -----------------------------------------

dashboard.get('/reports', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const member = await currentMember(c);
  const b = ctx.base;
  if (!member) return c.html(layout({ ...ctx, title: 'Statements' }, card(html`<p class="muted small">No giving record is linked to your account.</p>`)));
  const yearNow = new Date().getFullYear();
  const years = [];
  for (let y = yearNow; y >= yearNow - 5; y--) years.push(y);

  const body = card(html`
    <h1 style="font-size:1.4rem">Download a giving statement</h1>
    <form method="get" action="${b}/reports/download" class="mt-1">
      <div class="row">
        <label class="field"><span class="label">Type</span>
          <select class="input" name="type" id="rtype" onchange="document.getElementById('rmonth').style.display=this.value==='monthly'?'block':'none'">
            <option value="annual">Annual (tax statement)</option>
            <option value="monthly">Monthly</option>
          </select></label>
        <label class="field"><span class="label">Year</span>
          <select class="input" name="year">${years.map((y) => html`<option value="${y}">${y}</option>`)}</select></label>
      </div>
      <label class="field" id="rmonth" style="display:none"><span class="label">Month</span>
        <select class="input" name="month">${MONTHS.slice(1).map((m, i) => html`<option value="${i + 1}">${m}</option>`)}</select></label>
      ${submitBtn('Download PDF')}
    </form>`);
  return c.html(layout({ ...ctx, title: 'Statements' }, body));
});

dashboard.get('/reports/download', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const member = await currentMember(c);
  if (!member) return c.text('No giving record linked to your account.', 404);
  const type = c.req.query('type') === 'monthly' ? 'monthly' : 'annual';
  const year = parseInt(c.req.query('year'), 10) || new Date().getFullYear();
  const month = parseInt(c.req.query('month'), 10) || (new Date().getMonth() + 1);
  member._currency = ctx.settings.currency;

  const bytes = await getOrBuildStatement(c.env, ctx.settings, member, { type, year, month });
  await audit(c, 'export', 'report', member.id, { type, year, month });
  const fname = type === 'annual' ? `giving-statement-${year}.pdf` : `giving-statement-${year}-${String(month).padStart(2, '0')}.pdf`;
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fname}"` },
  });
});

// --- Profile ---------------------------------------------------------------

dashboard.get('/profile', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const member = await currentMember(c);
  return c.html(layout({ ...ctx, title: 'My profile' }, profileView(ctx, member)));
});

dashboard.post('/profile', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const member = await currentMember(c);
  if (!member) return c.redirect(`${ctx.base}/profile`);
  const form = await c.req.parseBody();
  const num = (v) => (v ? parseInt(v, 10) : null);
  const d = {
    first_name: (form.first_name || '').trim() || member.first_name,
    middle_name: (form.middle_name || '').trim(),
    last_name: (form.last_name || '').trim() || member.last_name,
    email: member.email, // email change is admin-only to keep login in sync
    phones: (form.phones || '').split(',').map((s) => s.trim()).filter(Boolean),
    dob_month: num(form.dob_month), dob_day: num(form.dob_day),
    anniversary_month: num(form.anniversary_month), anniversary_day: num(form.anniversary_day),
    address_line1: (form.address_line1 || '').trim(), address_line2: (form.address_line2 || '').trim(),
    city: (form.city || '').trim(), state: (form.state || '').trim(),
    postal_code: (form.postal_code || '').trim(), country: (form.country || '').trim(),
    family_id: member.family_id, family_role: member.family_role, notes: member.notes,
  };
  await updateMember(c.env.DB, cid(c), member.id, d);
  await audit(c, 'update', 'member', member.id, { self_profile: true });
  return c.html(layout({ ...ctx, title: 'My profile' }, profileView({ ...ctx }, await currentMember(c), 'Saved.')));
});

function profileView(ctx, member, saved) {
  const b = ctx.base;
  if (!member) {
    return card(html`<h1 style="font-size:1.4rem">My profile</h1>
      <p class="muted small">No member record is linked to your account. <a href="${b}/change-password">Change password</a></p>`);
  }
  const v = { ...member, phones: parsePhones(member.phones).join(', ') };
  const monthSel = (name, val) => html`<select class="input" name="${name}"><option value="">Month</option>
    ${MONTHS.slice(1).map((m, i) => html`<option value="${i + 1}" ${raw((i + 1) === Number(val) ? 'selected' : '')}>${m}</option>`)}</select>`;
  return html`
    ${saved ? alertBox('success', saved) : ''}
    ${card(html`
      <h1 style="font-size:1.4rem">My profile</h1>
      <form method="post" action="${b}/profile">
        <div class="row">
          <div>${field({ label: 'First name', name: 'first_name', value: v.first_name, required: true })}</div>
          <div>${field({ label: 'Last name', name: 'last_name', value: v.last_name, required: true })}</div>
        </div>
        ${field({ label: 'Middle name', name: 'middle_name', value: v.middle_name || '' })}
        ${field({ label: 'Email', name: 'email_display', value: v.email || '', hint: 'Contact your church to change your email.' })}
        ${field({ label: 'Phone(s)', name: 'phones', value: v.phones, hint: 'Comma-separated for more than one' })}
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
        ${submitBtn('Save profile')}
      </form>
      <p class="small mt-2"><a href="${b}/change-password">Change password</a></p>`)}`;
}

// Disable the email field so it is read-only (email edits are admin-only).
