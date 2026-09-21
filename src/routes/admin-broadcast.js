import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { all, one } from '../db.js';
import { requireAdmin } from '../middleware.js';
import { adminShell } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import { sendEmail, emailShell, emailEnabled } from '../services/email.js';

export const adminBroadcast = new Hono();
adminBroadcast.use('*', requireAdmin);

const cid = (c) => c.get('ctx').church.id;

async function recipientCount(db, churchId) {
  const r = await one(db, "SELECT COUNT(*) AS n FROM members WHERE church_id = ? AND membership_status = 'active' AND email IS NOT NULL AND email != ''", churchId);
  return r.n;
}

function composeView(ctx, { subject = '', message = '', error, count, enabled }) {
  const b = `${ctx.base}/admin/broadcast`;
  return card(html`
    <h2 style="font-size:1.15rem">Email your members</h2>
    <p class="muted small">Sends to all active members who have an email address (${count} right now).</p>
    ${!enabled ? alertBox('info', 'Email is not configured yet. Add a Resend API key in Settings → Email before sending.') : ''}
    <form method="post" action="${b}/preview">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Subject', name: 'subject', value: subject, required: true })}
      <label class="field"><span class="label">Message</span>
        <textarea class="input" name="message" rows="8" required placeholder="Write your announcement…">${message}</textarea>
        <span class="hint">Plain text. Line breaks are preserved. Your church name and contact details are added automatically.</span></label>
      ${submitBtn('Preview')}
    </form>`);
}

adminBroadcast.get('/', async (c) => {
  const ctx = c.get('ctx');
  const count = await recipientCount(c.env.DB, cid(c));
  return c.html(adminShell(ctx, '', 'Announcement', composeView(ctx, { count, enabled: emailEnabled(ctx.settings, c.env) })));
});

adminBroadcast.post('/preview', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const subject = (form.subject || '').toString().trim();
  const message = (form.message || '').toString();
  const count = await recipientCount(c.env.DB, cid(c));
  if (!subject || !message.trim()) {
    return c.html(adminShell(ctx, '', 'Announcement', composeView(ctx, { subject, message, count, enabled: emailEnabled(ctx.settings, c.env), error: 'Please add a subject and a message.' })));
  }
  const b = `${ctx.base}/admin/broadcast`;
  const bodyHtml = emailShell(ctx.settings, `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`);
  const body = html`
    ${card(html`<div class="label muted small mb-2">Preview — this will be sent to ${count} member(s)</div>
      <div style="border:1px solid var(--line);border-radius:8px;overflow:hidden">${raw(bodyHtml)}</div>`)}
    <form method="post" action="${b}/send" class="wrap-gap mt-2">
      <input type="hidden" name="subject" value="${escapeAttr(subject)}" />
      <input type="hidden" name="message" value="${escapeAttr(message)}" />
      <button class="btn btn-primary" ${raw(emailEnabled(ctx.settings, c.env) ? '' : 'disabled')}>Send to ${count} member(s)</button>
      <a href="${b}" class="btn btn-ghost">Edit</a>
    </form>`;
  return c.html(adminShell(ctx, '', 'Confirm announcement', body));
});

adminBroadcast.post('/send', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const subject = (form.subject || '').toString().trim();
  const message = (form.message || '').toString();
  if (!subject || !message.trim() || !emailEnabled(ctx.settings, c.env)) {
    return c.redirect(`${ctx.base}/admin/broadcast`);
  }
  const recipients = await all(c.env.DB, "SELECT id, first_name, email FROM members WHERE church_id = ? AND membership_status = 'active' AND email IS NOT NULL AND email != ''", churchId);
  const bodyHtml = emailShell(ctx.settings, `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`);
  const jobs = recipients.map((m) => sendEmail(c.env, ctx.settings, {
    to: m.email, type: 'broadcast', memberId: m.id, subject,
    html: bodyHtml,
  }));
  if (c.executionCtx) c.executionCtx.waitUntil(Promise.allSettled(jobs));
  await audit(c, 'create', 'broadcast', null, { recipients: recipients.length, subject });

  const body = card(html`${alertBox('success', `Your announcement is being sent to ${recipients.length} member(s).`)}
    <a href="${ctx.base}/admin" class="btn btn-primary btn-sm mt-1">Back to admin</a>`);
  return c.html(adminShell(ctx, '', 'Announcement sent', body));
});

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
