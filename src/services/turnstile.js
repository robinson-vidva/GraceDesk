// Cloudflare Turnstile verification. Site/secret keys come from church_settings
// (admin-editable) or fall back to env. When no secret is configured, the
// challenge is treated as disabled (verification passes) so local dev works.

export function turnstileSiteKey(settings, env) {
  return settings?.turnstile_site_key || env.TURNSTILE_SITE_KEY || '';
}

export function turnstileEnabled(settings, env) {
  return Boolean((settings?.turnstile_secret_key || env.TURNSTILE_SECRET_KEY));
}

export async function verifyTurnstile(token, ip, settings, env) {
  const secret = settings?.turnstile_secret_key || env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // disabled
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

// Renders the Turnstile widget + script when enabled.
export function turnstileWidget(settings, env) {
  const siteKey = turnstileSiteKey(settings, env);
  if (!turnstileEnabled(settings, env) || !siteKey) return '';
  return `<div class="cf-turnstile my-3" data-sitekey="${siteKey}"></div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}
