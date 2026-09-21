import { one, all, run, insert } from '../db.js';

// --- Contribution categories ----------------------------------------------

export async function listCategories(db, churchId) {
  return all(db, 'SELECT * FROM contribution_categories WHERE church_id = ? ORDER BY display_order, name', churchId);
}
export async function addCategory(db, churchId, name) {
  const max = await one(db, 'SELECT COALESCE(MAX(display_order),0) AS m FROM contribution_categories WHERE church_id = ?', churchId);
  return insert(db, 'INSERT INTO contribution_categories (church_id, name, display_order) VALUES (?, ?, ?)', churchId, name, (max.m || 0) + 1);
}
export async function renameCategory(db, churchId, id, name) {
  await run(db, "UPDATE contribution_categories SET name=?, updated_at=datetime('now') WHERE church_id=? AND id=?", name, churchId, id);
}
export async function toggleCategory(db, churchId, id) {
  await run(db, 'UPDATE contribution_categories SET is_active = 1 - is_active WHERE church_id=? AND id=?', churchId, id);
}

// --- Bible verses ----------------------------------------------------------

export async function listVerses(db, churchId) {
  return all(db, 'SELECT * FROM bible_verses WHERE church_id = ? ORDER BY id DESC', churchId);
}
export async function addVerse(db, churchId, reference, text) {
  return insert(db, 'INSERT INTO bible_verses (church_id, reference, text) VALUES (?, ?, ?)', churchId, reference, text);
}
export async function toggleVerse(db, churchId, id) {
  await run(db, 'UPDATE bible_verses SET is_active = 1 - is_active WHERE church_id=? AND id=?', churchId, id);
}
export async function deleteVerse(db, churchId, id) {
  await run(db, 'DELETE FROM bible_verses WHERE church_id=? AND id=?', churchId, id);
}

// Returns the church's settings merged with its identity (name/slug/status
// from the churches row), so `settings.church_name` keeps working everywhere.
export async function getSettings(db, churchId) {
  return one(
    db,
    `SELECT cs.*, c.name AS church_name, c.slug AS church_slug, c.status AS church_status, c.plan AS church_plan
       FROM church_settings cs
       JOIN churches c ON c.id = cs.church_id
      WHERE cs.church_id = ?`,
    churchId,
  );
}

// Columns an admin may update via the settings forms.
const SETTABLE = new Set([
  'primary_color', 'church_address_line1', 'church_address_line2', 'church_city',
  'church_state', 'church_zip', 'church_country', 'church_phone', 'church_email',
  'church_website', 'ein_tax_id', 'currency', 'timezone', 'date_format',
  'resend_api_key', 'default_from_email', 'reply_to_email',
  'thankyou_subject_template', 'thankyou_intro_text', 'email_image_url',
  'turnstile_site_key', 'turnstile_secret_key', 'church_logo_key', 'missions_enabled',
]);

export async function updateSettings(db, churchId, fields) {
  const keys = Object.keys(fields).filter((k) => SETTABLE.has(k));
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  const vals = keys.map((k) => fields[k]); // store as-is; '' is valid for NOT NULL text columns
  await db.prepare(`UPDATE church_settings SET ${set}, updated_at = datetime('now') WHERE church_id = ?`)
    .bind(...vals, churchId).run();
}

// The church display name lives on the churches row.
export async function updateChurchName(db, churchId, name) {
  await db.prepare("UPDATE churches SET name = ?, updated_at = datetime('now') WHERE id = ?").bind(name, churchId).run();
}

export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
}
