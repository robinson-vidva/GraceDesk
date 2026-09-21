import { one } from '../db.js';

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

export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
}
