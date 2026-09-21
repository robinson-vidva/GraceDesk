// Transactional email via Resend. If no API key is configured, email is
// skipped and the caller can surface a dev link on screen instead. Every send
// is written to email_logs.

import { run } from '../db.js';

function apiKey(settings, env) {
  return settings?.resend_api_key || env.RESEND_API_KEY || '';
}

function fromAddress(settings, env) {
  return settings?.default_from_email || env.EMAIL_FROM || 'GraceDesk <onboarding@resend.dev>';
}

export function emailEnabled(settings, env) {
  return Boolean(apiKey(settings, env));
}

// Sends an email and logs it. Returns { ok, id?, error? }.
export async function sendEmail(env, settings, { to, subject, html, replyTo, type, memberId, contributionId, verseUsed }) {
  const key = apiKey(settings, env);
  const log = async (status, providerId, error) => {
    await run(
      env.DB,
      `INSERT INTO email_logs (member_id, contribution_id, email_type, subject, recipient_email, provider_id, bible_verse_used, status, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      memberId ?? null, contributionId ?? null, type || 'other', subject, to,
      providerId ?? null, verseUsed ?? null, status, error ?? null,
      status === 'sent' ? new Date().toISOString() : null,
    );
  };

  if (!key) {
    await log('skipped', null, 'no api key');
    return { ok: false, error: 'email_disabled' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress(settings, env),
        to: [to],
        subject,
        html,
        reply_to: replyTo || settings?.reply_to_email || settings?.church_email || undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      await log('failed', null, text.slice(0, 500));
      return { ok: false, error: text };
    }
    const data = await res.json();
    await log('sent', data.id, null);
    return { ok: true, id: data.id };
  } catch (err) {
    await log('failed', null, String(err).slice(0, 500));
    return { ok: false, error: String(err) };
  }
}

// Shared branded wrapper for all outgoing emails.
export function emailShell(settings, innerHtml) {
  const name = settings?.church_name || 'Our Church';
  const color = settings?.primary_color || '#1f5a6b';
  const img = settings?.email_image_url
    ? `<img src="${settings.email_image_url}" alt="${name}" style="max-height:64px;margin-bottom:12px" />`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <div style="background:${color};color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center">
      ${img}<div style="font-size:20px;font-weight:bold">${name}</div>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      ${innerHtml}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
      <div style="font-size:12px;color:#64748b">
        ${name}${settings?.church_phone ? ' · ' + settings.church_phone : ''}${settings?.church_email ? ' · ' + settings.church_email : ''}<br/>
        Powered by GraceDesk
      </div>
    </div>
  </div>`;
}
