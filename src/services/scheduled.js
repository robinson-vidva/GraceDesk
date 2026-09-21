// Daily scheduled jobs (Cloudflare Cron Trigger). Sends birthday and
// anniversary greetings, and on the 1st a prior-month giving summary.
// Only churches with email configured actually send; others are skipped.

import { all, one } from '../db.js';
import { getSettings, formatMoney } from './settings.js';
import { sendEmail, emailShell, emailEnabled } from './email.js';

export async function runDailyJobs(env, now = new Date()) {
  const mm = now.getUTCMonth() + 1;
  const dd = now.getUTCDate();
  const churches = await all(env.DB, "SELECT id FROM churches WHERE status = 'active'");

  for (const { id: churchId } of churches) {
    const settings = await getSettings(env.DB, churchId);
    if (!settings || !emailEnabled(settings, env)) continue;

    await sendGreetings(env, settings, churchId, mm, dd, 'birthday');
    await sendGreetings(env, settings, churchId, mm, dd, 'anniversary');
    if (dd === 1) await sendMonthlySummaries(env, settings, churchId, now);
  }
}

async function sendGreetings(env, settings, churchId, mm, dd, kind) {
  const col = kind === 'birthday' ? 'dob' : 'anniversary';
  const members = await all(
    env.DB,
    `SELECT * FROM members WHERE church_id = ? AND membership_status = 'active'
       AND ${col}_month = ? AND ${col}_day = ? AND email IS NOT NULL`,
    churchId, mm, dd,
  );
  for (const m of members) {
    const title = kind === 'birthday' ? 'Happy Birthday' : 'Happy Anniversary';
    const line = kind === 'birthday'
      ? `Wishing you a very happy birthday from your family at ${settings.church_name}. We are grateful for you.`
      : `Wishing you a happy anniversary from all of us at ${settings.church_name}. We celebrate with you.`;
    await sendEmail(env, settings, {
      to: m.email, type: kind === 'birthday' ? 'birthday' : 'anniversary', memberId: m.id,
      subject: `${title}, ${m.first_name}!`,
      html: emailShell(settings, `<p>Dear ${m.first_name},</p><p>${line}</p>`),
    });
  }
}

async function sendMonthlySummaries(env, settings, churchId, now) {
  // Previous month window.
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based current; previous is m-1
  const prev = new Date(Date.UTC(y, m - 1, 1));
  const py = prev.getUTCFullYear();
  const pm = prev.getUTCMonth() + 1;
  const monthName = prev.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const key = `${py}-${String(pm).padStart(2, '0')}`;

  const rows = await all(
    env.DB,
    `SELECT m.id, m.first_name, m.email, SUM(ct.amount) AS total
       FROM contributions ct JOIN members m ON m.id = ct.member_id
      WHERE ct.church_id = ? AND ct.is_deleted = 0 AND m.email IS NOT NULL
        AND strftime('%Y-%m', ct.date) = ?
      GROUP BY m.id HAVING total > 0`,
    churchId, key,
  );
  for (const r of rows) {
    await sendEmail(env, settings, {
      to: r.email, type: 'monthly_summary', memberId: r.id,
      subject: `Your giving summary for ${monthName} ${py}`,
      html: emailShell(settings, `<p>Dear ${r.first_name},</p>
        <p>Thank you for your giving in ${monthName}. Your total for the month was
        <strong>${formatMoney(r.total, settings.currency)}</strong>.</p>
        <p>You can download a full statement any time from your member portal.</p>`),
    });
  }
}
