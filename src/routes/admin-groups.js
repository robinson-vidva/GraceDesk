import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { one, all, run, insert } from '../db.js';
import { requireModule } from '../middleware.js';
import { adminShell, table, empty } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { emailEnabled, sendEmail, emailShell } from '../services/email.js';
import { fullName } from '../services/members.js';

export const adminGroups = new Hono();
adminGroups.use('*', requireModule('groups_enabled'));

const cid = (c) => c.get('ctx').church.id;
const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

adminGroups.get('/', async (c) => {
  const ctx = c.get('ctx');
  const groups = await all(c.env.DB, `SELECT g.*, (SELECT COUNT(*) FROM group_memberships gm WHERE gm.group_id = g.id) AS members
    FROM member_groups g WHERE g.church_id = ? ORDER BY g.is_active DESC, g.name`, cid(c));
  const b = `${ctx.base}/admin/groups`;
  const body = html`
    ${card(html`<form method="post" action="${b}" class="toolbar" style="margin:0">
      <input class="input" name="name" placeholder="New group name" required />
      <input class="input" name="description" placeholder="Description (optional)" />
      <button class="btn btn-primary btn-sm">Create group</button></form>`)}
    <div class="mt-2">${table([
      { head: 'Group', cell: (g) => html`<a href="${b}/${g.id}">${g.name}</a>` },
      { head: 'Description', cell: (g) => g.description || '—' },
      { head: 'Members', cell: (g) => g.members },
    ], groups, 'No groups yet.')}</div>`;
  return c.html(adminShell(ctx, '/groups', 'Groups', body));
});

adminGroups.post('/', async (c) => {
  const ctx = c.get('ctx'); const form = await c.req.parseBody();
  const name = (form.name || '').toString().trim();
  if (name) {
    const id = await insert(c.env.DB, 'INSERT INTO member_groups (church_id, name, description) VALUES (?, ?, ?)', cid(c), name, (form.description || '').toString().trim() || null);
    await audit(c, 'create', 'group', id);
    return c.redirect(`${ctx.base}/admin/groups/${id}`);
  }
  return c.redirect(`${ctx.base}/admin/groups`);
});

adminGroups.get('/:id', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id');
  const g = await one(c.env.DB, 'SELECT * FROM member_groups WHERE church_id=? AND id=?', cid(c), id);
  if (!g) return c.notFound();
  const members = await all(c.env.DB, `SELECT m.* FROM group_memberships gm JOIN members m ON m.id = gm.member_id
    WHERE gm.group_id = ? ORDER BY m.last_name`, id);
  const others = await all(c.env.DB, `SELECT id, first_name, last_name FROM members WHERE church_id = ?
    AND id NOT IN (SELECT member_id FROM group_memberships WHERE group_id = ?) ORDER BY last_name LIMIT 1000`, cid(c), id);
  const withEmail = members.filter((m) => m.email).length;
  const b = `${ctx.base}/admin/groups`;
  const sent = c.req.query('sent');

  const body = html`
    <p class="small"><a href="${b}">← All groups</a></p>
    <div class="between mb-2"><h1 class="page-title" style="margin:0">${g.name}</h1></div>
    ${g.description ? html`<p class="muted small">${g.description}</p>` : ''}
    <div class="grid grid-2">
      ${card(html`<div class="label muted small mb-2">Members (${members.length})</div>
        ${members.length ? html`<div class="stack">${members.map((m) => html`
          <div class="between"><a href="${ctx.base}/admin/members/${m.id}" class="small">${fullName(m)}</a>
            <form method="post" action="${b}/${id}/remove"><input type="hidden" name="member_id" value="${m.id}" /><button class="btn btn-ghost btn-sm link-danger">Remove</button></form></div>`)}</div>`
          : empty('No members yet.')}
        <form method="post" action="${b}/${id}/add" class="toolbar mt-2" style="margin:0">
          <select class="input" name="member_id" required><option value="">Add a member…</option>
            ${others.map((m) => html`<option value="${m.id}">${m.last_name}, ${m.first_name}</option>`)}</select>
          <button class="btn btn-primary btn-sm">Add</button></form>`)}
      ${card(html`<div class="label muted small mb-2">Email this group</div>
        ${sent ? alertBox('success', `Message sent to ${sent} member(s).`) : ''}
        ${!emailEnabled(ctx.settings, c.env) ? alertBox('info', 'Configure email in Settings → Email to send.') : ''}
        <p class="muted small">${withEmail} of ${members.length} members have an email.</p>
        <form method="post" action="${b}/${id}/email">
          ${field({ label: 'Subject', name: 'subject', required: true })}
          <label class="field"><span class="label">Message</span><textarea class="input" name="message" rows="5" required></textarea></label>
          <button class="btn btn-primary btn-sm" ${raw(emailEnabled(ctx.settings, c.env) && withEmail ? '' : 'disabled')}>Send to group</button>
        </form>`)}
    </div>`;
  return c.html(adminShell(ctx, '/groups', g.name, body));
});

adminGroups.post('/:id/add', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id'); const form = await c.req.parseBody();
  if (form.member_id) {
    await run(c.env.DB, 'INSERT OR IGNORE INTO group_memberships (church_id, group_id, member_id) VALUES (?, ?, ?)', cid(c), id, form.member_id);
    await audit(c, 'update', 'group', id, { added: form.member_id });
  }
  return c.redirect(`${ctx.base}/admin/groups/${id}`);
});

adminGroups.post('/:id/remove', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id'); const form = await c.req.parseBody();
  await run(c.env.DB, 'DELETE FROM group_memberships WHERE church_id=? AND group_id=? AND member_id=?', cid(c), id, form.member_id);
  return c.redirect(`${ctx.base}/admin/groups/${id}`);
});

adminGroups.post('/:id/email', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id'); const form = await c.req.parseBody();
  const subject = (form.subject || '').toString().trim();
  const message = (form.message || '').toString();
  if (!subject || !message.trim() || !emailEnabled(ctx.settings, c.env)) return c.redirect(`${ctx.base}/admin/groups/${id}`);
  const recipients = await all(c.env.DB, `SELECT m.id, m.first_name, m.email FROM group_memberships gm JOIN members m ON m.id = gm.member_id
    WHERE gm.group_id = ? AND m.email IS NOT NULL AND m.email != ''`, id);
  const bodyHtml = emailShell(ctx.settings, `<p>${esc(message).replace(/\n/g, '<br/>')}</p>`);
  const jobs = recipients.map((m) => sendEmail(c.env, ctx.settings, { to: m.email, type: 'group', memberId: m.id, subject, html: bodyHtml }));
  if (c.executionCtx) c.executionCtx.waitUntil(Promise.allSettled(jobs));
  await audit(c, 'create', 'group_email', id, { recipients: recipients.length });
  return c.redirect(`${ctx.base}/admin/groups/${id}?sent=${recipients.length}`);
});
