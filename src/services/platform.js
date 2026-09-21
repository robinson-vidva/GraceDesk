import { one, all, run } from '../db.js';

export async function getPlatformAdminByEmail(db, email) {
  return one(db, 'SELECT * FROM platform_admins WHERE email = ?', (email || '').toLowerCase());
}
export async function getPlatformAdmin(db, id) {
  return one(db, 'SELECT * FROM platform_admins WHERE id = ?', id);
}

// All churches with lightweight usage stats for the operator dashboard.
export async function listChurchesWithStats(db, q = '') {
  let sql = `SELECT c.*,
      (SELECT COUNT(*) FROM members m WHERE m.church_id = c.id) AS members,
      (SELECT COUNT(*) FROM users u WHERE u.church_id = c.id) AS users,
      (SELECT COUNT(*) FROM contributions ct WHERE ct.church_id = c.id AND ct.is_deleted = 0) AS gifts
    FROM churches c`;
  const params = [];
  if (q) { sql += ' WHERE c.name LIKE ? OR c.slug LIKE ?'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY c.created_at DESC';
  return all(db, sql, ...params);
}

export async function getChurchStats(db, churchId) {
  return one(db, `SELECT
      (SELECT COUNT(*) FROM members WHERE church_id = ?) AS members,
      (SELECT COUNT(*) FROM users WHERE church_id = ?) AS users,
      (SELECT COUNT(*) FROM contributions WHERE church_id = ? AND is_deleted = 0) AS gifts,
      (SELECT COALESCE(SUM(amount),0) FROM contributions WHERE church_id = ? AND is_deleted = 0) AS total,
      (SELECT COUNT(*) FROM email_logs WHERE church_id = ?) AS emails`,
    churchId, churchId, churchId, churchId, churchId);
}

export async function setChurchStatus(db, churchId, status) {
  await run(db, "UPDATE churches SET status = ?, updated_at = datetime('now') WHERE id = ?", status, churchId);
}

export async function setCustomDomain(db, churchId, domain) {
  await run(db, "UPDATE churches SET custom_domain = ?, updated_at = datetime('now') WHERE id = ?", domain || null, churchId);
}

export async function findByCustomDomain(db, hostname) {
  return one(db, 'SELECT slug FROM churches WHERE custom_domain = ?', hostname);
}
