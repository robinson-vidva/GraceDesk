import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { requireAdmin } from '../middleware.js';
import { adminShell } from '../views/admin.js';
import { card } from '../views/layout.js';
import { field, submitBtn, alertBox } from '../views/forms.js';
import { audit } from '../services/audit.js';
import {
  getSettings, updateSettings, updateChurchName,
  listCategories, addCategory, renameCategory, toggleCategory,
  listVerses, addVerse, toggleVerse, deleteVerse,
} from '../services/settings.js';

export const adminSettings = new Hono();
adminSettings.use('*', requireAdmin);

const cid = (c) => c.get('ctx').church.id;
const SUB = [['', 'General'], ['/email', 'Email'], ['/security', 'Security'], ['/categories', 'Categories'], ['/verses', 'Verses']];

function subnav(ctx, active) {
  const b = `${ctx.base}/admin/settings`;
  return html`<div class="admin-nav" style="margin-top:-0.4rem">
    ${SUB.map(([p, l]) => html`<a href="${b}${p}" class="${active === p ? 'active' : ''}">${l}</a>`)}</div>`;
}
const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'INR', 'NGN', 'PHP', 'KES', 'ZAR', 'MXN', 'BRL'];

// --- General + logo --------------------------------------------------------

adminSettings.get('/', async (c) => {
  const ctx = c.get('ctx'); const s = ctx.settings;
  const saved = c.req.query('saved');
  const body = html`${subnav(ctx, '')}
    ${saved ? alertBox('success', 'Settings saved.') : ''}
    ${card(html`
      <form method="post" action="${ctx.base}/admin/settings">
        ${field({ label: 'Church name', name: 'church_name', value: s.church_name, required: true })}
        <label class="field"><span class="label">Brand color</span>
          <input class="input" type="color" name="primary_color" value="${s.primary_color}" style="width:5rem;height:2.4rem;padding:2px" /></label>
        ${field({ label: 'Address line 1', name: 'church_address_line1', value: s.church_address_line1 || '' })}
        ${field({ label: 'Address line 2', name: 'church_address_line2', value: s.church_address_line2 || '' })}
        <div class="row">
          <div>${field({ label: 'City', name: 'church_city', value: s.church_city || '' })}</div>
          <div>${field({ label: 'State', name: 'church_state', value: s.church_state || '' })}</div>
        </div>
        <div class="row">
          <div>${field({ label: 'ZIP', name: 'church_zip', value: s.church_zip || '' })}</div>
          <div>${field({ label: 'Country', name: 'church_country', value: s.church_country || '' })}</div>
        </div>
        <div class="row">
          <div>${field({ label: 'Phone', name: 'church_phone', value: s.church_phone || '' })}</div>
          <div>${field({ label: 'Public email', name: 'church_email', type: 'email', value: s.church_email || '' })}</div>
        </div>
        ${field({ label: 'Website', name: 'church_website', value: s.church_website || '' })}
        ${field({ label: 'EIN / Tax ID', name: 'ein_tax_id', value: s.ein_tax_id || '', hint: 'Shown on giving statements' })}
        <div class="row">
          <label class="field"><span class="label">Currency</span>
            <select class="input" name="currency">${CURRENCIES.map((x) => html`<option ${raw(x === s.currency ? 'selected' : '')}>${x}</option>`)}</select></label>
          ${field({ label: 'Timezone', name: 'timezone', value: s.timezone || 'America/New_York' })}
        </div>
        ${submitBtn('Save settings')}
      </form>`)}
    ${card(html`
      <div class="label muted small mb-2">Church logo</div>
      ${s.church_logo_key ? html`<img src="${ctx.base}/logo" alt="logo" style="height:56px;border-radius:8px;margin-bottom:0.6rem" /><br/>` : html`<p class="muted small">No logo uploaded.</p>`}
      <form method="post" action="${ctx.base}/admin/settings/logo" enctype="multipart/form-data" class="wrap-gap">
        <input class="input" type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" required style="width:auto" />
        <button class="btn btn-ghost btn-sm">Upload</button>
      </form>`)}`;
  return c.html(adminShell(ctx, '/settings', 'Settings', body));
});

adminSettings.post('/', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const name = (form.church_name || '').toString().trim();
  if (name) await updateChurchName(c.env.DB, churchId, name);
  await updateSettings(c.env.DB, churchId, pick(form, [
    'primary_color', 'church_address_line1', 'church_address_line2', 'church_city', 'church_state',
    'church_zip', 'church_country', 'church_phone', 'church_email', 'church_website', 'ein_tax_id',
    'currency', 'timezone',
  ]));
  await audit(c, 'settings_change', 'settings', churchId, { section: 'general' });
  return c.redirect(`${ctx.base}/admin/settings?saved=1`);
});

adminSettings.post('/logo', async (c) => {
  const ctx = c.get('ctx'); const churchId = cid(c);
  const form = await c.req.parseBody();
  const file = form.logo;
  if (file && typeof file === 'object' && file.arrayBuffer) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || 'png';
    const key = `logos/${churchId}/logo-${Date.now()}.${ext}`;
    await c.env.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'image/png' } });
    await updateSettings(c.env.DB, churchId, { church_logo_key: key });
    await audit(c, 'settings_change', 'settings', churchId, { logo: true });
  }
  return c.redirect(`${ctx.base}/admin/settings?saved=1`);
});

// --- Email -----------------------------------------------------------------

adminSettings.get('/email', async (c) => {
  const ctx = c.get('ctx'); const s = ctx.settings;
  const body = html`${subnav(ctx, '/email')}
    ${c.req.query('saved') ? alertBox('success', 'Email settings saved.') : ''}
    ${card(html`<form method="post" action="${ctx.base}/admin/settings/email">
      ${field({ label: 'Resend API key', name: 'resend_api_key', type: 'password', value: s.resend_api_key || '', hint: 'Stored per church. Without it, emails are skipped.' })}
      ${field({ label: 'From address', name: 'default_from_email', value: s.default_from_email || '', hint: 'e.g. Church Name <giving@yourchurch.org> (domain must be verified in Resend)' })}
      ${field({ label: 'Reply-to address', name: 'reply_to_email', value: s.reply_to_email || '' })}
      ${field({ label: 'Thank-you subject', name: 'thankyou_subject_template', value: s.thankyou_subject_template || '', hint: 'Use {church_name} as a placeholder' })}
      <label class="field"><span class="label">Thank-you intro text</span>
        <textarea class="input" name="thankyou_intro_text" rows="3">${s.thankyou_intro_text || ''}</textarea></label>
      ${field({ label: 'Email banner image URL', name: 'email_image_url', value: s.email_image_url || '' })}
      ${submitBtn('Save email settings')}
    </form>`)}`;
  return c.html(adminShell(ctx, '/settings', 'Settings', body));
});

adminSettings.post('/email', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  await updateSettings(c.env.DB, cid(c), pick(form, [
    'resend_api_key', 'default_from_email', 'reply_to_email', 'thankyou_subject_template', 'thankyou_intro_text', 'email_image_url',
  ]));
  await audit(c, 'settings_change', 'settings', cid(c), { section: 'email' });
  return c.redirect(`${ctx.base}/admin/settings/email?saved=1`);
});

// --- Security (Turnstile) --------------------------------------------------

adminSettings.get('/security', async (c) => {
  const ctx = c.get('ctx'); const s = ctx.settings;
  const body = html`${subnav(ctx, '/security')}
    ${c.req.query('saved') ? alertBox('success', 'Security settings saved.') : ''}
    ${card(html`<form method="post" action="${ctx.base}/admin/settings/security">
      <p class="muted small mb-2">Cloudflare Turnstile protects your login and registration forms from bots. Leave blank to disable.</p>
      ${field({ label: 'Turnstile site key', name: 'turnstile_site_key', value: s.turnstile_site_key || '' })}
      ${field({ label: 'Turnstile secret key', name: 'turnstile_secret_key', type: 'password', value: s.turnstile_secret_key || '' })}
      ${submitBtn('Save security settings')}
    </form>`)}`;
  return c.html(adminShell(ctx, '/settings', 'Settings', body));
});

adminSettings.post('/security', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  await updateSettings(c.env.DB, cid(c), pick(form, ['turnstile_site_key', 'turnstile_secret_key']));
  await audit(c, 'settings_change', 'settings', cid(c), { section: 'security' });
  return c.redirect(`${ctx.base}/admin/settings/security?saved=1`);
});

// --- Categories ------------------------------------------------------------

adminSettings.get('/categories', async (c) => {
  const ctx = c.get('ctx');
  const cats = await listCategories(c.env.DB, cid(c));
  const b = `${ctx.base}/admin/settings/categories`;
  const body = html`${subnav(ctx, '/categories')}
    ${card(html`<form method="post" action="${b}" class="wrap-gap">
      <input class="input" name="name" placeholder="New category name" required />
      <button class="btn btn-primary btn-sm">Add</button></form>`)}
    <div class="stack mt-2">${cats.map((cat) => card(html`
      <form method="post" action="${b}/${cat.id}" class="between" style="gap:0.6rem">
        <input class="input" name="name" value="${cat.name}" style="max-width:20rem" />
        <div class="wrap-gap">
          <span class="badge badge-${cat.is_active ? 'ok' : 'muted'}">${cat.is_active ? 'active' : 'hidden'}</span>
          <button class="btn btn-ghost btn-sm" name="op" value="rename">Save</button>
          <button class="btn btn-ghost btn-sm" name="op" value="toggle">${cat.is_active ? 'Hide' : 'Show'}</button>
        </div>
      </form>`))}</div>`;
  return c.html(adminShell(ctx, '/settings', 'Categories', body));
});

adminSettings.post('/categories', async (c) => {
  const ctx = c.get('ctx'); const form = await c.req.parseBody();
  const name = (form.name || '').toString().trim();
  if (name) { await addCategory(c.env.DB, cid(c), name); await audit(c, 'create', 'category', null, { name }); }
  return c.redirect(`${ctx.base}/admin/settings/categories`);
});

adminSettings.post('/categories/:id', async (c) => {
  const ctx = c.get('ctx'); const id = c.req.param('id'); const form = await c.req.parseBody();
  if (form.op === 'toggle') await toggleCategory(c.env.DB, cid(c), id);
  else if ((form.name || '').toString().trim()) await renameCategory(c.env.DB, cid(c), id, form.name.toString().trim());
  await audit(c, 'update', 'category', id);
  return c.redirect(`${ctx.base}/admin/settings/categories`);
});

// --- Verses ----------------------------------------------------------------

adminSettings.get('/verses', async (c) => {
  const ctx = c.get('ctx');
  const verses = await listVerses(c.env.DB, cid(c));
  const b = `${ctx.base}/admin/settings/verses`;
  const body = html`${subnav(ctx, '/verses')}
    <p class="muted small mb-2">One of your active verses is chosen at random for each thank-you email.</p>
    ${card(html`<form method="post" action="${b}">
      ${field({ label: 'Reference', name: 'reference', value: '', required: true, placeholder: '2 Corinthians 9:7' })}
      <label class="field"><span class="label">Verse text <span class="req">*</span></span><textarea class="input" name="text" rows="2" required></textarea></label>
      <button class="btn btn-primary btn-sm">Add verse</button></form>`)}
    <div class="stack mt-2">${verses.map((v) => card(html`
      <div class="between" style="gap:0.6rem">
        <div><div><strong>${v.reference}</strong> <span class="badge badge-${v.is_active ? 'ok' : 'muted'}">${v.is_active ? 'active' : 'hidden'}</span></div>
          <div class="small muted">${v.text}</div></div>
        <div class="wrap-gap">
          <form method="post" action="${b}/${v.id}/toggle"><button class="btn btn-ghost btn-sm">${v.is_active ? 'Hide' : 'Show'}</button></form>
          <form method="post" action="${b}/${v.id}/delete" onsubmit="return confirm('Delete this verse?')"><button class="btn btn-ghost btn-sm link-danger">Delete</button></form>
        </div>
      </div>`))}</div>`;
  return c.html(adminShell(ctx, '/settings', 'Verses', body));
});

adminSettings.post('/verses', async (c) => {
  const ctx = c.get('ctx'); const form = await c.req.parseBody();
  const ref = (form.reference || '').toString().trim(); const text = (form.text || '').toString().trim();
  if (ref && text) { await addVerse(c.env.DB, cid(c), ref, text); await audit(c, 'create', 'verse'); }
  return c.redirect(`${ctx.base}/admin/settings/verses`);
});
adminSettings.post('/verses/:id/toggle', async (c) => {
  const ctx = c.get('ctx'); await toggleVerse(c.env.DB, cid(c), c.req.param('id'));
  return c.redirect(`${ctx.base}/admin/settings/verses`);
});
adminSettings.post('/verses/:id/delete', async (c) => {
  const ctx = c.get('ctx'); await deleteVerse(c.env.DB, cid(c), c.req.param('id'));
  await audit(c, 'delete', 'verse', c.req.param('id'));
  return c.redirect(`${ctx.base}/admin/settings/verses`);
});

function pick(form, keys) {
  const out = {};
  for (const k of keys) out[k] = (form[k] ?? '').toString().trim();
  return out;
}
