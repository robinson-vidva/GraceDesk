import { one, all, run, insert } from '../db.js';

export const METHODS = ['cash', 'check', 'zelle', 'bank_transfer', 'zeffy', 'stripe', 'paypal', 'other'];
export const METHOD_LABELS = {
  cash: 'Cash', check: 'Check', zelle: 'Zelle', bank_transfer: 'Bank transfer',
  zeffy: 'Zeffy', stripe: 'Stripe', paypal: 'PayPal', other: 'Other',
};

export async function activeCategories(db, churchId) {
  return all(db, 'SELECT * FROM contribution_categories WHERE church_id = ? AND is_active = 1 ORDER BY display_order, name', churchId);
}

// Next receipt number for a church + year: YYYY-NNN, sequential per year.
export async function nextReceiptNumber(db, churchId, year) {
  const row = await one(
    db,
    `SELECT receipt_number FROM contributions
      WHERE church_id = ? AND receipt_number LIKE ?
      ORDER BY receipt_number DESC LIMIT 1`,
    churchId, `${year}-%`,
  );
  let n = 0;
  if (row?.receipt_number) n = parseInt(row.receipt_number.split('-')[1], 10) || 0;
  return `${year}-${String(n + 1).padStart(3, '0')}`;
}

export async function createContribution(db, churchId, d) {
  const year = (d.date || '').slice(0, 4) || String(new Date().getFullYear());
  const receipt = await nextReceiptNumber(db, churchId, year);
  const id = await insert(
    db,
    `INSERT INTO contributions (church_id, member_id, category_id, amount, currency, date, method, receipt_number, notes, entered_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    churchId, d.member_id, d.category_id || null, d.amount, d.currency, d.date, d.method, receipt, d.notes || null, d.entered_by_id || null,
  );
  await invalidateReports(db, churchId, d.member_id);
  return { id, receipt };
}

export async function getContribution(db, churchId, id) {
  return one(
    db,
    `SELECT ct.*, cc.name AS category, m.first_name, m.last_name
       FROM contributions ct
       LEFT JOIN contribution_categories cc ON cc.id = ct.category_id
       LEFT JOIN members m ON m.id = ct.member_id
      WHERE ct.church_id = ? AND ct.id = ?`,
    churchId, id,
  );
}

export async function updateContribution(db, churchId, id, d) {
  const existing = await one(db, 'SELECT member_id FROM contributions WHERE church_id = ? AND id = ?', churchId, id);
  await run(
    db,
    `UPDATE contributions SET member_id=?, category_id=?, amount=?, date=?, method=?, notes=?, updated_at=datetime('now')
      WHERE church_id=? AND id=?`,
    d.member_id, d.category_id || null, d.amount, d.date, d.method, d.notes || null, churchId, id,
  );
  await invalidateReports(db, churchId, d.member_id);
  if (existing && existing.member_id !== d.member_id) await invalidateReports(db, churchId, existing.member_id);
}

export async function softDeleteContribution(db, churchId, id, reason, userId) {
  const existing = await one(db, 'SELECT member_id FROM contributions WHERE church_id = ? AND id = ?', churchId, id);
  await run(
    db,
    `UPDATE contributions SET is_deleted=1, deleted_reason=?, deleted_by_id=?, deleted_at=datetime('now')
      WHERE church_id=? AND id=?`,
    reason || null, userId || null, churchId, id,
  );
  if (existing) await invalidateReports(db, churchId, existing.member_id);
}

// Filtered list for the admin table.
export async function listContributions(db, churchId, { q = '', method = '', categoryId = '', from = '', to = '', memberId = '' } = {}) {
  let sql = `SELECT ct.*, cc.name AS category, m.first_name, m.last_name
               FROM contributions ct
               LEFT JOIN contribution_categories cc ON cc.id = ct.category_id
               LEFT JOIN members m ON m.id = ct.member_id
              WHERE ct.church_id = ? AND ct.is_deleted = 0`;
  const p = [churchId];
  if (q) { sql += ` AND (m.first_name LIKE ? OR m.last_name LIKE ? OR ct.receipt_number LIKE ?)`; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (method) { sql += ` AND ct.method = ?`; p.push(method); }
  if (categoryId) { sql += ` AND ct.category_id = ?`; p.push(categoryId); }
  if (from) { sql += ` AND ct.date >= ?`; p.push(from); }
  if (to) { sql += ` AND ct.date <= ?`; p.push(to); }
  if (memberId) { sql += ` AND ct.member_id = ?`; p.push(memberId); }
  sql += ` ORDER BY ct.date DESC, ct.id DESC LIMIT 1000`;
  return all(db, sql, ...p);
}

// Member-facing history (only non-deleted, for one member).
export async function memberContributions(db, churchId, memberId, { year = '' } = {}) {
  let sql = `SELECT ct.*, cc.name AS category FROM contributions ct
               LEFT JOIN contribution_categories cc ON cc.id = ct.category_id
              WHERE ct.church_id = ? AND ct.member_id = ? AND ct.is_deleted = 0`;
  const p = [churchId, memberId];
  if (year) { sql += ` AND strftime('%Y', ct.date) = ?`; p.push(String(year)); }
  sql += ` ORDER BY ct.date DESC, ct.id DESC`;
  return all(db, sql, ...p);
}

export async function memberTotals(db, churchId, memberId) {
  return one(db, `SELECT
      COALESCE(SUM(CASE WHEN strftime('%Y', date) = strftime('%Y','now') THEN amount END),0) AS year,
      COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m','now') THEN amount END),0) AS month
    FROM contributions WHERE church_id = ? AND member_id = ? AND is_deleted = 0`, churchId, memberId);
}

export async function randomVerse(db, churchId) {
  return one(db, 'SELECT * FROM bible_verses WHERE church_id = ? AND is_active = 1 ORDER BY RANDOM() LIMIT 1', churchId);
}

async function invalidateReports(db, churchId, memberId) {
  await run(db, 'UPDATE report_cache SET is_valid = 0 WHERE church_id = ? AND member_id = ?', churchId, memberId);
}
