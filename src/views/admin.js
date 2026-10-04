import { html, raw } from 'hono/html';
import { layout } from './layout.js';

const SECTIONS = [
  ['', 'Overview'],
  ['/members', 'Members'],
  ['/families', 'Families'],
  ['/contributions', 'Contributions'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
];

// Admin chrome: section nav + page. `active` is the section path (e.g. '/members').
export function adminShell(ctx, active, title, body) {
  const b = `${ctx.base}/admin`;
  const nav = html`
    <nav class="admin-nav">
      ${SECTIONS.map(([path, label]) => html`
        <a href="${b}${path}" class="${active === path ? 'active' : ''}">${label}</a>`)}
      ${ctx.settings?.pledges_enabled ? html`<a href="${b}/pledges" class="${active === '/pledges' ? 'active' : ''}">Pledges</a>` : ''}
      ${ctx.settings?.groups_enabled ? html`<a href="${b}/groups" class="${active === '/groups' ? 'active' : ''}">Groups</a>` : ''}
      ${ctx.settings?.attendance_enabled ? html`<a href="${b}/attendance" class="${active === '/attendance' ? 'active' : ''}">Attendance</a>` : ''}
      ${ctx.settings?.missions_enabled ? html`<a href="${b}/missions" class="${active === '/missions' ? 'active' : ''}">Missions</a>` : ''}
      ${ctx.user?.can_manage_admins ? html`<a href="${b}/users" class="${active === '/users' ? 'active' : ''}">Users</a>` : ''}
      <a href="${b}/audit" class="${active === '/audit' ? 'active' : ''}">Audit</a>
    </nav>`;
  const inner = html`
    ${nav}
    <div class="admin-body">
      ${title ? html`<h1 class="page-title">${title}</h1>` : ''}
      ${body}
    </div>`;
  return layout({ ...ctx, title: title ? `${title} - Admin` : 'Admin' }, inner);
}

export function badge(status) {
  const map = { active: 'ok', pending: 'warn', inactive: 'muted' };
  return html`<span class="badge badge-${map[status] || 'muted'}">${status}</span>`;
}

export function toolbar(inner) {
  return html`<div class="toolbar">${inner}</div>`;
}

export function empty(message) {
  return html`<div class="empty">${message}</div>`;
}

// Columns that hold figures are right-aligned so the digits line up, as in a ledger.
const FIGURE_HEADS = new Set(['Amount', 'Pledged', 'Received', 'Gifts', 'Count', 'Support', 'Members']);
const isFigure = (c) => c.num ?? FIGURE_HEADS.has(c.head);
const headClass = (c) => isFigure(c) ? 'num' : '';
const cellClass = (c) => isFigure(c) ? 'num' : c.head === 'Receipt' ? 'mono' : '';

// Renders a simple table. columns: [{head, cell(row), num?}]. rows: array.
// `total` is optional: { label, values: { [head]: text } } adds a closing row
// with the column totals under a double rule.
export function table(columns, rows, emptyMsg = 'Nothing here yet.', total = null) {
  if (!rows.length) return empty(emptyMsg);
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${columns.map((c) => html`<th class="${headClass(c)}">${c.head}</th>`)}</tr></thead>
        <tbody>
          ${rows.map((r) => html`<tr>${columns.map((c) => html`<td class="${cellClass(c)}">${c.cell(r)}</td>`)}</tr>`)}
          ${total ? html`<tr class="total">${columns.map((c, i) => html`<td class="${headClass(c)}">${
            total.values[c.head] ?? (i === 0 ? total.label : '')}</td>`)}</tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

export { raw };
