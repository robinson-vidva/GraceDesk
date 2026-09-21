// Idempotent dev seed: creates one demo church with a default admin so a fresh
// local database is usable immediately. In production, churches are created
// through the public signup flow instead — this only runs when there are no
// churches at all.

import { one, run } from '../db.js';
import { createChurchWithAdmin } from '../services/churches.js';
import { hashPassword } from '../auth.js';

let seeded = false;

export async function ensureSeeded(env) {
  if (seeded) return;
  const db = env.DB;

  const existing = await one(db, 'SELECT COUNT(*) AS n FROM churches');
  if (existing.n === 0) {
    const email = (env.ADMIN_EMAIL || 'admin@gracedesk.local').toLowerCase();
    const password = env.ADMIN_PASSWORD || 'changeme123';
    await createChurchWithAdmin(db, {
      name: 'Demo Church',
      slug: 'demo',
      adminEmail: email,
      adminPassword: password,
      adminFirst: 'Admin',
      adminLast: 'User',
      mustChangePassword: 1,
    });
  }

  // Platform operator account (manages all churches). Seeded once.
  const padmin = await one(db, 'SELECT COUNT(*) AS n FROM platform_admins');
  if (padmin.n === 0) {
    const pEmail = (env.PLATFORM_ADMIN_EMAIL || 'platform@gracedesk.local').toLowerCase();
    const pPass = env.PLATFORM_ADMIN_PASSWORD || 'changeme123';
    const hash = await hashPassword(pPass);
    await run(db, 'INSERT INTO platform_admins (email, password_hash, name) VALUES (?, ?, ?)', pEmail, hash, 'Operator');
  }

  seeded = true;
}
