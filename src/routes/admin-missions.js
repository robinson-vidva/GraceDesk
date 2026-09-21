import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { requireAdmin } from '../middleware.js';
import { adminShell, badge, table, toolbar, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { formatMoney } from '../services/settings.js';
import {
  listSites, getSite, createSite, updateSite, toggleSite, missionTotals,
  listSupport, addSupport, deleteSupport, SUPPORT_METHODS, SUPPORT_METHOD_LABELS,
} from '../services/missions.js';

export const adminMissions = new Hono();
adminMissions.use('*', requireAdmin);

// Gate the whole module behind the per-church toggle.
adminMissions.use('*', async (c, next) => {
  const ctx = c.get('ctx');
  if (!ctx.settings.missions_enabled) {
    return c.html(adminShell(ctx, '/missions', 'Missions',
      card(html`<p class="muted small">The missions module is turned off. Enable it in
        <a href="${ctx.base}/admin/settings">Settings</a> to track supported mission churches and schools.</p>`)));
  }
  await next();
});

const cid = (c) => c.get('ctx').church.id;
const today = () => new Date().toISOString().slice(0, 10);

// --- Overview --------------------------------------------------------------

adminMissions.get('/', async (c) => {
  const ctx = c.get('ctx'); const cur = ctx.settings.currency;
  const t = await missionTotals(c.env.DB, cid(c));
  const sites = await listSites(c.env.DB, cid(c));
  const b = `${ctx.base}/admin/missions`;

  const body = html`
    ${toolbar(html`<a href="${b}/new" class="btn btn-primary btn-sm" style="margin-left:auto">Add mission site</a>`)}
    <div class="tiles mb-2">
      ${tile('Mission churches', t.churches)}
      ${tile('Schools', t.schools)}
      ${tile('Countries', t.countries)}
      ${tile('Pastors', t.pastors)}
      ${tile('Teachers', t.teachers)}
      ${tile('Students', t.students)}
      ${tile('Sent this year', formatMoney(t.support_year, cur))}
      ${tile('Sent all time', formatMoney(t.support_total, cur))}
    </div>
    ${table([
      { head: 'Site', cell: (s) => html`<a href="${b}/${s.id}">${s.name}</a>` },
      { head: 'Type', cell: (s) => cap(s.type) },
      { head: 'Country', cell: (s) => s.country || '—' },
      { head: 'People', cell: (s) => s.type === 'school' ? `${s.teachers_count} teachers · ${s.students_count} students` : `${s.pastors_count} pastors` },
      { head: 'Support', cell: (s) => formatMoney(s.support_total, cur) },
      { head: 'Status', cell: (s) => badge(s.is_active ? 'active' : 'inactive') },
    ], sites, 'No mission sites yet. Add the first one.')}`;
  return c.html(adminShell(ctx, '/missions', 'Missions', body));
});

// --- Create / edit ---------------------------------------------------------

adminMissions.get('/new', (c) => {
  const ctx = c.get('ctx');
  return c.html(adminShell(ctx, '/missions', 'Add mission site',
    siteForm(ctx, { action: `${ctx.base}/admin/missions/new`, submitLabel: 'Add site', values: { type: 'church' } })));
});

adminMissions.post('/new', async (c) => {
  const ctx = c.get('ctx');
  const d = readSite(await c.req.parseBody());
  if (!d.name) return c.html(adminShell(ctx, '/missions', 'Add mission site',
    siteForm(ctx, { action: `${ctx.base}/admin/missions/new`, submitLabel: 'Add site', values: d, error: 'Please give the site a name or location.' })));
  const id = await createSite(c.env.DB, cid(c), d);
  await audit(c, 'create', 'mission_site', id, { type: d.type });
  return c.redirect(`${ctx.base}/admin/missions/${id}`);
});

adminMissions.get('/:id/edit', async (c) => {
  const ctx = c.get('ctx');
  const s = await getSite(c.env.DB, cid(c), c.req.param('id'));
  if (!s) return c.notFound();
  return c.html(adminShell(ctx, '/missions', `Edit ${s.name}`,
    siteForm(ctx, { action: `${ctx.base}/admin/missions/${s.id}/edit`, submitLabel: 'Save changes', values: s })));
});

adminMissions.post('/:id/edit', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  const d = readSite(await c.req.parseBody());
  if (!d.name) return c.redirect(`${ctx.base}/admin/missions/${id}/edit`);
  await updateSite(c.env.DB, cid(c), id, d);
  await audit(c, 'update', 'mission_site', id);
  return c.redirect(`${ctx.base}/admin/missions/${id}`);
});

adminMissions.post('/:id/toggle', async (c) => {
  const ctx = c.get('ctx');
  await toggleSite(c.env.DB, cid(c), c.req.param('id'));
  await audit(c, 'update', 'mission_site', c.req.param('id'), { toggled: true });
  return c.redirect(`${ctx.base}/admin/missions/${c.req.param('id')}`);
});

// --- Detail + support ------------------------------------------------------

adminMissions.get('/:id', async (c) => {
  const ctx = c.get('ctx'); const cur = ctx.settings.currency;
  const s = await getSite(c.env.DB, cid(c), c.req.param('id'));
  if (!s) return c.notFound();
  const support = await listSupport(c.env.DB, cid(c), s.id);
  const total = support.reduce((a, r) => a + r.amount, 0);
  const b = `${ctx.base}/admin/missions`;

  const people = s.type === 'school'
    ? html`<dt>Teachers</dt><dd>${s.teachers_count}</dd><dt>Students</dt><dd>${s.students_count}</dd>`
    : html`<dt>Pastors</dt><dd>${s.pastors_count}</dd>`;

  const body = html`
    <div class="between mb-2">
      <div class="flex">${badge(s.is_active ? 'active' : 'inactive')} <span class="muted small">${cap(s.type)}</span></div>
      <div class="wrap-gap">
        <a href="${b}/${s.id}/edit" class="btn btn-ghost btn-sm">Edit</a>
        <form method="post" action="${b}/${s.id}/toggle"><button class="btn btn-ghost btn-sm">${s.is_active ? 'Archive' : 'Restore'}</button></form>
      </div>
    </div>
    <div class="grid grid-2">
      ${card(html`<dl class="detail">
        <dt>Name</dt><dd>${s.name}</dd>
        <dt>Country</dt><dd>${s.country || '—'}</dd>
        ${people}
        <dt>Total sent</dt><dd><strong>${formatMoney(total, cur)}</strong></dd>
      </dl>${s.notes ? html`<p class="small muted mt-2">${s.notes}</p>` : ''}`)}
      ${card(html`
        <div class="label muted small mb-2">Record support sent</div>
        <form method="post" action="${b}/${s.id}/support">
          <div class="row">
            <label class="field"><span class="label">Amount (${cur})</span><input class="input" type="number" step="0.01" min="0" name="amount" required /></label>
            <div>${field({ label: 'Date', name: 'date', type: 'date', value: today(), required: true })}</div>
          </div>
          <label class="field"><span class="label">Method</span>
            <select class="input" name="method">${SUPPORT_METHODS.map((m) => html`<option value="${m}">${SUPPORT_METHOD_LABELS[m]}</option>`)}</select></label>
          ${field({ label: 'Notes', name: 'notes', value: '' })}
          ${submitBtn('Record support')}
        </form>`)}
    </div>
    <div class="mt-2">${table([
      { head: 'Date', cell: (r) => r.date },
      { head: 'Amount', cell: (r) => formatMoney(r.amount, r.currency || cur) },
      { head: 'Method', cell: (r) => SUPPORT_METHOD_LABELS[r.method] || r.method },
      { head: 'Notes', cell: (r) => r.notes || '—' },
      { head: '', cell: (r) => html`<form method="post" action="${b}/support/${r.id}/delete" onsubmit="return confirm('Delete this support record?')"><button class="btn btn-ghost btn-sm link-danger">Delete</button></form>` },
    ], support, 'No support recorded for this site yet.')}</div>`;
  return c.html(adminShell(ctx, '/missions', s.name, body));
});

adminMissions.post('/:id/support', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  const form = await c.req.parseBody();
  const amount = parseFloat(form.amount) || 0;
  if (amount > 0) {
    await addSupport(c.env.DB, cid(c), {
      site_id: id, amount, currency: ctx.settings.currency,
      date: (form.date || today()).toString(), method: form.method || 'bank_transfer',
      notes: (form.notes || '').toString().trim(), entered_by_id: ctx.user.id,
    });
    await audit(c, 'create', 'mission_support', id, { amount });
  }
  return c.redirect(`${ctx.base}/admin/missions/${id}`);
});

adminMissions.post('/support/:sid/delete', async (c) => {
  const ctx = c.get('ctx');
  const rec = await c.env.DB.prepare('SELECT site_id FROM mission_support WHERE church_id=? AND id=?').bind(cid(c), c.req.param('sid')).first();
  await deleteSupport(c.env.DB, cid(c), c.req.param('sid'));
  await audit(c, 'delete', 'mission_support', c.req.param('sid'));
  return c.redirect(`${ctx.base}/admin/missions/${rec ? rec.site_id : ''}`);
});

// --- helpers ---------------------------------------------------------------

function readSite(form) {
  const n = (v) => Math.max(0, parseInt(v, 10) || 0);
  const type = form.type === 'school' ? 'school' : 'church';
  return {
    name: (form.name || '').toString().trim(),
    type, country: (form.country || '').toString().trim(),
    pastors_count: type === 'church' ? n(form.pastors_count) : 0,
    teachers_count: type === 'school' ? n(form.teachers_count) : 0,
    students_count: type === 'school' ? n(form.students_count) : 0,
    notes: (form.notes || '').toString().trim(),
  };
}

function siteForm(ctx, { action, submitLabel, values = {}, error }) {
  const v = values;
  return card(html`
    <form method="post" action="${action}">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Name or location', name: 'name', value: v.name || '', required: true, placeholder: 'e.g. Nairobi, Kenya' })}
      <div class="row">
        <label class="field"><span class="label">Type</span>
          <select class="input" name="type" onchange="document.getElementById('ch').style.display=this.value==='church'?'block':'none';document.getElementById('sc').style.display=this.value==='school'?'block':'none'">
            <option value="church" ${raw(v.type !== 'school' ? 'selected' : '')}>Mission church</option>
            <option value="school" ${raw(v.type === 'school' ? 'selected' : '')}>School</option>
          </select></label>
        <div>${field({ label: 'Country', name: 'country', value: v.country || '' })}</div>
      </div>
      <div id="ch" style="display:${v.type === 'school' ? 'none' : 'block'}">
        ${field({ label: 'Number of pastors', name: 'pastors_count', type: 'number', value: v.pastors_count || '' })}
      </div>
      <div id="sc" style="display:${v.type === 'school' ? 'block' : 'none'}">
        <div class="row">
          <div>${field({ label: 'Number of teachers', name: 'teachers_count', type: 'number', value: v.teachers_count || '' })}</div>
          <div>${field({ label: 'Number of students', name: 'students_count', type: 'number', value: v.students_count || '' })}</div>
        </div>
      </div>
      <label class="field"><span class="label">Notes</span><textarea class="input" name="notes" rows="2">${v.notes || ''}</textarea></label>
      ${submitBtn(submitLabel)}
    </form>`);
}

function tile(label, value) {
  return card(html`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`);
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
