import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { one, all, run } from '../db.js';
import { requireModule } from '../middleware.js';
import { adminShell, table, toolbar, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { formatMoney } from '../services/settings.js';
import { fullName } from '../services/members.js';

export const adminPledges = new Hono();
adminPledges.use('*', requireModule('pledges_enabled'));

const cid = (c) => c.get('ctx').church.id;

adminPledges.get('/', async (c) => {
  const ctx = c.get('ctx'); const cur = ctx.settings.currency;
  const year = parseInt(c.req.query('year'), 10) || new Date().getFullYear();
  const rows = await all(c.env.DB, `
    SELECT m.id AS member_id, m.first_name, m.middle_name, m.last_name, p.id AS pledge_id, p.amount AS pledged,
      COALESCE((SELECT SUM(amount) FROM contributions ct WHERE ct.church_id = p.church_id AND ct.member_id = m.id
                AND ct.is_deleted = 0 AND strftime('%Y', ct.date) = ?), 0) AS received
    FROM pledges p JOIN members m ON m.id = p.member_id
    WHERE p.church_id = ? AND p.year = ? ORDER BY m.last_name, m.first_name`, String(year), cid(c), year);
  const members = await all(c.env.DB, "SELECT id, first_name, last_name FROM members WHERE church_id = ? AND membership_status != 'inactive' ORDER BY last_name", cid(c));
  const totalPledged = rows.reduce((s, r) => s + r.pledged, 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const b = `${ctx.base}/admin/pledges`;
  const years = []; for (let y = new Date().getFullYear() + 1; y >= year - 3; y--) years.push(y);

  const body = html`
    ${toolbar(html`<form method="get" action="${b}" class="toolbar" style="margin:0">
      <label class="label" style="margin:0">Year</label>
      <select class="input" name="year" onchange="this.form.submit()">
        ${[...new Set([year, ...years])].sort((a, z) => z - a).map((y) => html`<option value="${y}" ${raw(y === year ? 'selected' : '')}>${y}</option>`)}
      </select></form>`)}
    <div class="tiles mb-2">
      ${tile('Total pledged', formatMoney(totalPledged, cur))}
      ${tile('Received so far', formatMoney(totalReceived, cur))}
      ${tile('Progress', totalPledged ? Math.round((totalReceived / totalPledged) * 100) + '%' : '—')}
    </div>
    ${card(html`<div class="label muted small mb-2">Add or update a pledge for ${year}</div>
      <form method="post" action="${b}" class="toolbar" style="margin:0;flex-wrap:wrap">
        <input type="hidden" name="year" value="${year}" />
        <select class="input" name="member_id" required><option value="">Choose a member…</option>
          ${members.map((m) => html`<option value="${m.id}">${m.last_name}, ${m.first_name}</option>`)}</select>
        <input class="input" type="number" step="0.01" min="0" name="amount" placeholder="Amount" required style="max-width:9rem" />
        <button class="btn btn-primary btn-sm">Save pledge</button>
      </form>`)}
    <div class="mt-2">${table([
      { head: 'Member', cell: (r) => html`<a href="${ctx.base}/admin/members/${r.member_id}">${fullName(r)}</a>` },
      { head: 'Pledged', cell: (r) => formatMoney(r.pledged, cur) },
      { head: 'Received', cell: (r) => formatMoney(r.received, cur) },
      { head: 'Progress', cell: (r) => progressBar(r.received, r.pledged) },
      { head: '', cell: (r) => html`<form method="post" action="${b}/${r.pledge_id}/delete" onsubmit="return confirm('Remove this pledge?')"><button class="btn btn-ghost btn-sm link-danger">Remove</button></form>` },
    ], rows, `No pledges recorded for ${year} yet.`)}</div>`;
  return c.html(adminShell(ctx, '/pledges', 'Pledges', body));
});

adminPledges.post('/', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const memberId = form.member_id; const year = parseInt(form.year, 10) || new Date().getFullYear();
  const amount = parseFloat(form.amount);
  if (memberId && amount > 0) {
    const existing = await one(c.env.DB, 'SELECT id FROM pledges WHERE church_id=? AND member_id=? AND year=?', churchId, memberId, year);
    if (existing) await run(c.env.DB, "UPDATE pledges SET amount=?, updated_at=datetime('now') WHERE id=?", amount, existing.id);
    else await run(c.env.DB, 'INSERT INTO pledges (church_id, member_id, year, amount) VALUES (?, ?, ?, ?)', churchId, memberId, year, amount);
    await audit(c, 'update', 'pledge', memberId, { year, amount });
  }
  return c.redirect(`${ctx.base}/admin/pledges?year=${year}`);
});

adminPledges.post('/:id/delete', async (c) => {
  const ctx = c.get('ctx');
  const row = await one(c.env.DB, 'SELECT year FROM pledges WHERE church_id=? AND id=?', cid(c), c.req.param('id'));
  await run(c.env.DB, 'DELETE FROM pledges WHERE church_id=? AND id=?', cid(c), c.req.param('id'));
  await audit(c, 'delete', 'pledge', c.req.param('id'));
  return c.redirect(`${ctx.base}/admin/pledges${row ? '?year=' + row.year : ''}`);
});

function tile(label, value) {
  return card(html`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`);
}
function progressBar(received, pledged) {
  const pct = pledged ? Math.min(100, Math.round((received / pledged) * 100)) : 0;
  return html`<div style="min-width:120px"><div style="height:8px;background:#eee7db;border-radius:4px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--brand)"></div></div><span class="small muted">${pct}%</span></div>`;
}
