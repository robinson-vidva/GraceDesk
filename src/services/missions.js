import { one, all, run, insert } from '../db.js';

export const SUPPORT_METHODS = ['bank_transfer', 'wire', 'check', 'cash', 'paypal', 'other'];
export const SUPPORT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer', wire: 'Wire', check: 'Check', cash: 'Cash', paypal: 'PayPal', other: 'Other',
};

export async function listSites(db, churchId) {
  return all(db, `SELECT s.*,
      (SELECT COALESCE(SUM(amount),0) FROM mission_support ms WHERE ms.site_id = s.id) AS support_total
     FROM mission_sites s WHERE s.church_id = ? ORDER BY s.is_active DESC, s.name`, churchId);
}

export async function getSite(db, churchId, id) {
  return one(db, 'SELECT * FROM mission_sites WHERE church_id = ? AND id = ?', churchId, id);
}

export async function createSite(db, churchId, d) {
  return insert(db,
    `INSERT INTO mission_sites (church_id, name, type, country, pastors_count, teachers_count, students_count, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    churchId, d.name, d.type, d.country || null,
    d.pastors_count || 0, d.teachers_count || 0, d.students_count || 0, d.notes || null);
}

export async function updateSite(db, churchId, id, d) {
  await run(db,
    `UPDATE mission_sites SET name=?, type=?, country=?, pastors_count=?, teachers_count=?, students_count=?, notes=?, updated_at=datetime('now')
     WHERE church_id=? AND id=?`,
    d.name, d.type, d.country || null, d.pastors_count || 0, d.teachers_count || 0, d.students_count || 0, d.notes || null, churchId, id);
}

export async function toggleSite(db, churchId, id) {
  await run(db, 'UPDATE mission_sites SET is_active = 1 - is_active WHERE church_id=? AND id=?', churchId, id);
}

// Simple aggregate numbers across active sites.
export async function missionTotals(db, churchId) {
  const sites = await one(db, `SELECT
      COUNT(*) AS sites,
      COALESCE(SUM(CASE WHEN type='church' THEN 1 ELSE 0 END),0) AS churches,
      COALESCE(SUM(CASE WHEN type='school' THEN 1 ELSE 0 END),0) AS schools,
      COALESCE(SUM(pastors_count),0) AS pastors,
      COALESCE(SUM(teachers_count),0) AS teachers,
      COALESCE(SUM(students_count),0) AS students,
      COUNT(DISTINCT country) AS countries
    FROM mission_sites WHERE church_id = ? AND is_active = 1`, churchId);
  const money = await one(db, `SELECT
      COALESCE(SUM(amount),0) AS total,
      COALESCE(SUM(CASE WHEN strftime('%Y',date)=strftime('%Y','now') THEN amount END),0) AS this_year
    FROM mission_support WHERE church_id = ?`, churchId);
  return { ...sites, support_total: money.total, support_year: money.this_year };
}

export async function listSupport(db, churchId, siteId) {
  return all(db, 'SELECT * FROM mission_support WHERE church_id = ? AND site_id = ? ORDER BY date DESC, id DESC', churchId, siteId);
}

export async function addSupport(db, churchId, d) {
  return insert(db,
    `INSERT INTO mission_support (church_id, site_id, amount, currency, date, method, notes, entered_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    churchId, d.site_id, d.amount, d.currency, d.date, d.method, d.notes || null, d.entered_by_id || null);
}

export async function deleteSupport(db, churchId, id) {
  await run(db, 'DELETE FROM mission_support WHERE church_id=? AND id=?', churchId, id);
}
