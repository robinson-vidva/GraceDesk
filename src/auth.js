// Password hashing (WebCrypto PBKDF2) and session helpers — all Workers-native.

import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { one, run } from './db.js';

const PBKDF2_ITERATIONS = 210000; // OWASP-recommended for PBKDF2-SHA256
const SESSION_COOKIE = 'gd_session';
const SESSION_TTL_DAYS = 30;

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

// Stored format: pbkdf2$<iterations>$<saltHex>$<hashHex>
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, iterStr, saltHex, hashHex] = stored.split('$');
  const iterations = parseInt(iterStr, 10);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const hash = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(toHex(hash), hashHex);
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Sessions (stored in D1, id in an HttpOnly cookie) --------------------

export async function createSession(c, userId, data = {}) {
  const id = randomHex(32);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await run(
    c.env.DB,
    'INSERT INTO sessions (id, user_id, data, expires_at) VALUES (?, ?, ?, ?)',
    id, userId, JSON.stringify(data), expires.toISOString(),
  );
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    secure: c.req.url.startsWith('https'),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 86400,
  });
  return id;
}

export async function getSession(c) {
  const id = getCookie(c, SESSION_COOKIE);
  if (!id) return null;
  const row = await one(c.env.DB, 'SELECT * FROM sessions WHERE id = ?', id);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  return { id: row.id, userId: row.user_id, data: JSON.parse(row.data || '{}') };
}

export async function destroySession(c) {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await run(c.env.DB, 'DELETE FROM sessions WHERE id = ?', id);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function updateSessionData(c, sessionId, data) {
  await run(c.env.DB, 'UPDATE sessions SET data = ? WHERE id = ?', JSON.stringify(data), sessionId);
}

// SHA-256 hex — used to store reset/invite tokens hashed at rest.
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return toHex(buf);
}

export { randomHex };
