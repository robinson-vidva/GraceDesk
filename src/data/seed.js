// Idempotent first-run seed: ensures the church_settings row, default
// categories, starter Bible verses, and the default admin exist. Runs on the
// first request (see src/index.js) so a fresh D1 database is ready to use.

import { one, run, insert } from '../db.js';
import { hashPassword } from '../auth.js';

const DEFAULT_CATEGORIES = [
  'Sunday Offering',
  'Monthly Tithe',
  'Special Offering',
  'Building Fund',
  'Missions',
  'Other',
];

const STARTER_VERSES = [
  ['2 Corinthians 9:7', 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.'],
  ['Proverbs 3:9', 'Honor the Lord with your wealth, with the firstfruits of all your crops.'],
  ['Luke 6:38', 'Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap.'],
  ['Malachi 3:10', 'Bring the whole tithe into the storehouse, that there may be food in my house.'],
  ['Acts 20:35', 'It is more blessed to give than to receive.'],
];

let seeded = false;

export async function ensureSeeded(env) {
  if (seeded) return;
  const db = env.DB;

  // Church settings row.
  const settings = await one(db, 'SELECT id FROM church_settings WHERE id = 1');
  if (!settings) {
    await run(db, 'INSERT INTO church_settings (id) VALUES (1)');
  }

  // Categories.
  const catCount = await one(db, 'SELECT COUNT(*) AS n FROM contribution_categories');
  if (catCount.n === 0) {
    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      await run(
        db,
        'INSERT INTO contribution_categories (name, display_order) VALUES (?, ?)',
        DEFAULT_CATEGORIES[i], i,
      );
    }
  }

  // Bible verses.
  const verseCount = await one(db, 'SELECT COUNT(*) AS n FROM bible_verses');
  if (verseCount.n === 0) {
    for (const [ref, text] of STARTER_VERSES) {
      await run(db, 'INSERT INTO bible_verses (reference, text) VALUES (?, ?)', ref, text);
    }
  }

  // Default admin (only when there are no users at all).
  const userCount = await one(db, 'SELECT COUNT(*) AS n FROM users');
  if (userCount.n === 0) {
    const email = (env.ADMIN_EMAIL || 'admin@gracedesk.local').toLowerCase();
    const password = env.ADMIN_PASSWORD || 'changeme123';
    const hash = await hashPassword(password);
    await insert(
      db,
      `INSERT INTO users (email, password_hash, first_name, last_name, is_admin,
        can_manage_admins, is_active, must_change_password)
       VALUES (?, ?, 'Admin', 'User', 1, 1, 1, 1)`,
      email, hash,
    );
  }

  seeded = true;
}
