import { one, all, run, insert } from '../db.js';

export function parsePhones(json) {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
  catch { return json ? [json] : []; }
}

export function fullName(m) {
  return [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ');
}

export async function countByStatus(db, churchId, status) {
  const r = await one(db, 'SELECT COUNT(*) AS n FROM members WHERE church_id = ? AND membership_status = ?', churchId, status);
  return r.n;
}

// List members with optional search + filters.
export async function listMembers(db, churchId, { q = '', status = '', familyId = '' } = {}) {
  let sql = `SELECT m.*, f.family_name
               FROM members m
               LEFT JOIN families f ON f.id = m.family_id
              WHERE m.church_id = ?`;
  const params = [churchId];
  if (q) {
    sql += ` AND (m.first_name LIKE ? OR m.last_name LIKE ? OR m.email LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) { sql += ` AND m.membership_status = ?`; params.push(status); }
  if (familyId) { sql += ` AND m.family_id = ?`; params.push(familyId); }
  sql += ` ORDER BY m.last_name, m.first_name LIMIT 500`;
  return all(db, sql, ...params);
}

export async function getMember(db, churchId, id) {
  return one(db, 'SELECT * FROM members WHERE church_id = ? AND id = ?', churchId, id);
}

export async function getMemberUser(db, churchId, memberId) {
  return one(db, 'SELECT * FROM users WHERE church_id = ? AND member_id = ?', churchId, memberId);
}

export async function createMember(db, churchId, d) {
  return insert(
    db,
    `INSERT INTO members (church_id, first_name, middle_name, last_name, email, phones,
       dob_month, dob_day, anniversary_month, anniversary_day,
       address_line1, address_line2, city, state, postal_code, country,
       membership_status, family_id, family_role, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    churchId, d.first_name, d.middle_name || null, d.last_name, d.email || null,
    d.phones ? JSON.stringify(d.phones) : null,
    d.dob_month || null, d.dob_day || null, d.anniversary_month || null, d.anniversary_day || null,
    d.address_line1 || null, d.address_line2 || null, d.city || null, d.state || null,
    d.postal_code || null, d.country || null,
    d.membership_status || 'active', d.family_id || null, d.family_role || null, d.notes || null,
  );
}

export async function updateMember(db, churchId, id, d) {
  await run(
    db,
    `UPDATE members SET first_name=?, middle_name=?, last_name=?, email=?, phones=?,
       dob_month=?, dob_day=?, anniversary_month=?, anniversary_day=?,
       address_line1=?, address_line2=?, city=?, state=?, postal_code=?, country=?,
       family_id=?, family_role=?, notes=?, updated_at=datetime('now')
     WHERE church_id=? AND id=?`,
    d.first_name, d.middle_name || null, d.last_name, d.email || null,
    d.phones ? JSON.stringify(d.phones) : null,
    d.dob_month || null, d.dob_day || null, d.anniversary_month || null, d.anniversary_day || null,
    d.address_line1 || null, d.address_line2 || null, d.city || null, d.state || null,
    d.postal_code || null, d.country || null,
    d.family_id || null, d.family_role || null, d.notes || null,
    churchId, id,
  );
}

export async function setMemberStatus(db, churchId, id, status) {
  await run(db, "UPDATE members SET membership_status=?, updated_at=datetime('now') WHERE church_id=? AND id=?", status, churchId, id);
}

// --- Families --------------------------------------------------------------

export async function listFamilies(db, churchId) {
  return all(
    db,
    `SELECT f.*, h.first_name AS head_first, h.last_name AS head_last,
            (SELECT COUNT(*) FROM members m WHERE m.family_id = f.id) AS member_count
       FROM families f
       LEFT JOIN members h ON h.id = f.head_member_id
      WHERE f.church_id = ?
      ORDER BY f.family_name`,
    churchId,
  );
}

export async function getFamily(db, churchId, id) {
  return one(db, 'SELECT * FROM families WHERE church_id = ? AND id = ?', churchId, id);
}

export async function familyMembers(db, churchId, familyId) {
  return all(db, 'SELECT * FROM members WHERE church_id = ? AND family_id = ? ORDER BY family_role, last_name', churchId, familyId);
}

export async function createFamily(db, churchId, familyName, headMemberId = null) {
  return insert(db, 'INSERT INTO families (church_id, family_name, head_member_id) VALUES (?, ?, ?)', churchId, familyName, headMemberId || null);
}

export async function updateFamily(db, churchId, id, familyName, headMemberId) {
  await run(db, "UPDATE families SET family_name=?, head_member_id=?, updated_at=datetime('now') WHERE church_id=? AND id=?", familyName, headMemberId || null, churchId, id);
}

export async function assignFamily(db, churchId, memberId, familyId, role) {
  await run(db, "UPDATE members SET family_id=?, family_role=?, updated_at=datetime('now') WHERE church_id=? AND id=?", familyId || null, role || null, churchId, memberId);
}
