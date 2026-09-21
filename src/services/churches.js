// Tenant (church) provisioning and lookup.

import { one, run, insert } from '../db.js';
import { hashPassword } from '../auth.js';

const DEFAULT_CATEGORIES = [
  'Sunday Offering', 'Monthly Tithe', 'Special Offering',
  'Building Fund', 'Missions', 'Other',
];

const STARTER_VERSES = [
  ['2 Corinthians 9:7', 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.'],
  ['Proverbs 3:9', 'Honor the Lord with your wealth, with the firstfruits of all your crops.'],
  ['Luke 6:38', 'Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap.'],
  ['Malachi 3:10', 'Bring the whole tithe into the storehouse, that there may be food in my house.'],
  ['Acts 20:35', 'It is more blessed to give than to receive.'],
];

export function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'church';
}

export async function slugAvailable(db, slug) {
  const row = await one(db, 'SELECT id FROM churches WHERE slug = ?', slug);
  return !row;
}

// Finds a free slug based on `base`, appending -2, -3, ... if taken.
export async function uniqueSlug(db, base) {
  const root = slugify(base);
  if (await slugAvailable(db, root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (await slugAvailable(db, candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export async function getChurchBySlug(db, slug) {
  return one(db, 'SELECT * FROM churches WHERE slug = ?', slug);
}

// Creates a church row + its settings, default categories, and starter verses.
export async function provisionChurch(db, { name, slug }) {
  const churchId = await insert(
    db, 'INSERT INTO churches (slug, name) VALUES (?, ?)', slug, name,
  );
  await run(db, 'INSERT INTO church_settings (church_id) VALUES (?)', churchId);
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    await run(
      db, 'INSERT INTO contribution_categories (church_id, name, display_order) VALUES (?, ?, ?)',
      churchId, DEFAULT_CATEGORIES[i], i,
    );
  }
  for (const [ref, text] of STARTER_VERSES) {
    await run(db, 'INSERT INTO bible_verses (church_id, reference, text) VALUES (?, ?, ?)', churchId, ref, text);
  }
  return churchId;
}

// Full signup: provisions a church and creates its first (active) admin, who
// can manage other admins. Returns { churchId, slug, userId }.
export async function createChurchWithAdmin(db, { name, slug, adminEmail, adminPassword, adminFirst, adminLast, mustChangePassword = 0 }) {
  const finalSlug = slug || (await uniqueSlug(db, name));
  const churchId = await provisionChurch(db, { name, slug: finalSlug });
  const hash = await hashPassword(adminPassword);
  const userId = await insert(
    db,
    `INSERT INTO users (church_id, email, password_hash, first_name, last_name,
       is_admin, can_manage_admins, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?)`,
    churchId, adminEmail.toLowerCase(), hash, adminFirst || 'Admin', adminLast || '', mustChangePassword,
  );
  return { churchId, slug: finalSlug, userId };
}
