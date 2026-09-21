import { one } from '../db.js';

// Returns the single church_settings row (id = 1). Assumes seed has run.
export async function getSettings(db) {
  return one(db, 'SELECT * FROM church_settings WHERE id = 1');
}

// Formats an amount using the church's currency.
export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount ?? 0);
  } catch {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }
}
