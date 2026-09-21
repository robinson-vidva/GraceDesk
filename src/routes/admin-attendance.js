import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { one, all, run } from '../db.js';
import { requireModule } from '../middleware.js';
import { adminShell, table, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn } from '../views/forms.js';
import { audit } from '../services/audit.js';

export const adminAttendance = new Hono();
adminAttendance.use('*', requireModule('attendance_enabled'));

const cid = (c) => c.get('ctx').church.id;
const today = () => new Date().toISOString().slice(0, 10);

adminAttendance.get('/', async (c) => {
  const ctx = c.get('ctx');
  const rows = await all(c.env.DB, 'SELECT * FROM attendance WHERE church_id = ? ORDER BY date DESC, id DESC LIMIT 100', cid(c));
  const agg = await one(c.env.DB, `SELECT COUNT(*) AS n, COALESCE(AVG(count),0) AS avg, COALESCE(MAX(count),0) AS max
    FROM (SELECT count FROM attendance WHERE church_id = ? ORDER BY date DESC LIMIT 12)`, cid(c));
  const b = `${ctx.base}/admin/attendance`;
  const trend = rows.slice(0, 12).reverse();

  const body = html`
    <div class="tiles mb-2">
      ${tile('Recent average', Math.round(agg.avg))}
      ${tile('Best (recent)', agg.max)}
      ${tile('Records', rows.length)}
    </div>
    ${trend.length ? card(html`<div class="label muted small mb-2">Recent attendance</div>${chart(trend)}`) : ''}
    ${card(html`<div class="label muted small mb-2">Record attendance</div>
      <form method="post" action="${b}" class="toolbar" style="margin:0;flex-wrap:wrap">
        <input class="input" type="date" name="date" value="${today()}" required />
        <input class="input" name="service_name" placeholder="Service (e.g. Sunday AM)" />
        <input class="input" type="number" min="0" name="count" placeholder="Count" required style="max-width:8rem" />
        <input class="input" name="notes" placeholder="Notes" />
        <button class="btn btn-primary btn-sm">Add</button>
      </form>`)}
    <div class="mt-2">${table([
      { head: 'Date', cell: (r) => r.date },
      { head: 'Service', cell: (r) => r.service_name || '—' },
      { head: 'Count', cell: (r) => r.count },
      { head: 'Notes', cell: (r) => r.notes || '—' },
      { head: '', cell: (r) => html`<form method="post" action="${b}/${r.id}/delete" onsubmit="return confirm('Delete?')"><button class="btn btn-ghost btn-sm link-danger">Delete</button></form>` },
    ], rows, 'No attendance recorded yet.')}</div>`;
  return c.html(adminShell(ctx, '/attendance', 'Attendance', body));
});

adminAttendance.post('/', async (c) => {
  const ctx = c.get('ctx'); const form = await c.req.parseBody();
  const count = parseInt(form.count, 10);
  if (form.date && count >= 0) {
    await run(c.env.DB, 'INSERT INTO attendance (church_id, date, service_name, count, notes) VALUES (?, ?, ?, ?, ?)',
      cid(c), form.date.toString(), (form.service_name || '').toString().trim() || null, count, (form.notes || '').toString().trim() || null);
    await audit(c, 'create', 'attendance', null, { count });
  }
  return c.redirect(`${ctx.base}/admin/attendance`);
});

adminAttendance.post('/:id/delete', async (c) => {
  const ctx = c.get('ctx');
  await run(c.env.DB, 'DELETE FROM attendance WHERE church_id=? AND id=?', cid(c), c.req.param('id'));
  await audit(c, 'delete', 'attendance', c.req.param('id'));
  return c.redirect(`${ctx.base}/admin/attendance`);
});

function tile(label, value) {
  return card(html`<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`);
}
function chart(items) {
  const max = Math.max(1, ...items.map((x) => x.count));
  const W = 640, H = 150, pad = 24, bw = (W - pad * 2) / items.length;
  return html`<div class="table-wrap" style="border:none;background:none;overflow-x:auto">
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:640px" role="img" aria-label="Attendance">
      ${raw(items.map((x, i) => {
        const h = Math.round((x.count / max) * (H - pad * 2));
        const xx = pad + i * bw + 3;
        return `<rect x="${xx}" y="${H - pad - h}" width="${bw - 6}" height="${h}" rx="2" fill="var(--brand)" opacity="0.9"><title>${x.date}: ${x.count}</title></rect>
          <text x="${xx + (bw - 6) / 2}" y="${H - 8}" font-size="8" fill="#6d675e" text-anchor="middle">${x.date.slice(5)}</text>`;
      }).join(''))}
    </svg></div>`;
}
