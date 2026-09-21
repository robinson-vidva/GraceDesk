import { Hono } from 'hono';
import { one, run, insert } from '../db.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, randomHex, sha256Hex,
} from '../auth.js';
import { verifyTurnstile } from '../services/turnstile.js';
import { sendEmail, emailShell, emailEnabled } from '../services/email.js';
import { audit } from '../services/audit.js';
import { requireAuth } from '../middleware.js';
import {
  loginPage, registerPage, registeredPage, forgotPage, resetPage, changePasswordPage,
} from '../views/auth.js';

export const auth = new Hono();

const clientIp = (c) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

// Progressive lockout durations (minutes) once failed attempts reach 5.
function lockMinutes(failedAttempts) {
  if (failedAttempts < 5) return 0;
  const step = failedAttempts - 5; // 5->0, 6->1, ...
  return [15, 30, 60, 1440][Math.min(step, 3)];
}

// --- Register --------------------------------------------------------------

auth.get('/register', (c) => {
  const ctx = c.get('ctx');
  if (ctx.user) return c.redirect('/dashboard');
  return c.html(registerPage(ctx, c.env));
});

auth.post('/register', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const values = {
    first_name: (form.first_name || '').trim(),
    last_name: (form.last_name || '').trim(),
    email: (form.email || '').trim().toLowerCase(),
    phone: (form.phone || '').trim(),
  };
  const fail = (error) => c.html(registerPage(ctx, c.env, { error, values }));

  if (!values.first_name || !values.last_name || !validEmail(values.email)) {
    return fail('Please fill in your name and a valid email.');
  }
  if ((form.password || '').length < 8) return fail('Password must be at least 8 characters.');
  if (form.password !== form.password2) return fail('Passwords do not match.');

  const ok = await verifyTurnstile(form['cf-turnstile-response'], clientIp(c), ctx.settings, c.env);
  if (!ok) return fail('Bot check failed. Please try again.');

  const existing = await one(c.env.DB, 'SELECT id FROM users WHERE email = ?', values.email);
  if (existing) return fail('An account with that email already exists. Try logging in.');

  // Create pending member + inactive user.
  const memberId = await insert(
    c.env.DB,
    `INSERT INTO members (first_name, last_name, email, phones, membership_status)
     VALUES (?, ?, ?, ?, 'pending')`,
    values.first_name, values.last_name, values.email,
    values.phone ? JSON.stringify([values.phone]) : null,
  );
  const hash = await hashPassword(form.password);
  const userId = await insert(
    c.env.DB,
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active, member_id)
     VALUES (?, ?, ?, ?, 0, ?)`,
    values.email, hash, values.first_name, values.last_name, memberId,
  );
  await audit(c, 'create', 'member', memberId, { self_registered: true, userId });
  return c.html(registeredPage(ctx));
});

// --- Login -----------------------------------------------------------------

auth.get('/login', (c) => {
  const ctx = c.get('ctx');
  if (ctx.user) return c.redirect('/dashboard');
  return c.html(loginPage(ctx, c.env));
});

auth.post('/login', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const email = (form.email || '').trim().toLowerCase();
  const password = form.password || '';
  const ip = clientIp(c);
  const fail = (error) => c.html(loginPage(ctx, c.env, { error, email }));

  const ok = await verifyTurnstile(form['cf-turnstile-response'], ip, ctx.settings, c.env);
  if (!ok) return fail('Bot check failed. Please try again.');

  const user = await one(c.env.DB, 'SELECT * FROM users WHERE email = ?', email);
  const logAttempt = (success) => run(
    c.env.DB, 'INSERT INTO login_attempts (email, ip_address, successful) VALUES (?, ?, ?)',
    email, ip, success ? 1 : 0,
  );

  // Locked?
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    await logAttempt(false);
    return fail('Too many attempts. Your account is temporarily locked. Try again later.');
  }

  const passwordOk = user?.password_hash && await verifyPassword(password, user.password_hash);
  if (!user || !passwordOk) {
    await logAttempt(false);
    if (user) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const mins = lockMinutes(attempts);
      const lockedUntil = mins ? new Date(Date.now() + mins * 60_000).toISOString() : null;
      await run(
        c.env.DB, 'UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?',
        attempts, lockedUntil, user.id,
      );
    }
    return fail('Incorrect email or password.');
  }

  if (!user.is_active) {
    await logAttempt(false);
    return fail('Your account is not active yet. An admin must approve it first.');
  }

  // Success.
  await logAttempt(true);
  await run(
    c.env.DB,
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?',
    new Date().toISOString(), user.id,
  );
  await createSession(c, user.id);
  c.set('ctx', { ...ctx, user });
  await audit(c, 'login', 'user', user.id);
  if (user.must_change_password) return c.redirect('/change-password');
  return c.redirect('/dashboard');
});

auth.get('/logout', async (c) => {
  const ctx = c.get('ctx');
  if (ctx.user) await audit(c, 'logout', 'user', ctx.user.id);
  await destroySession(c);
  return c.redirect('/');
});

// --- Forgot / reset password ----------------------------------------------

auth.get('/forgot-password', (c) => c.html(forgotPage(c.get('ctx'), c.env)));

auth.post('/forgot-password', async (c) => {
  const ctx = c.get('ctx');
  const form = await c.req.parseBody();
  const email = (form.email || '').trim().toLowerCase();
  const ok = await verifyTurnstile(form['cf-turnstile-response'], clientIp(c), ctx.settings, c.env);
  if (!ok) return c.html(forgotPage(ctx, c.env, { error: 'Bot check failed. Please try again.' }));

  const user = await one(c.env.DB, 'SELECT * FROM users WHERE email = ?', email);
  let devLink = null;
  if (user) {
    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
    await run(c.env.DB, 'UPDATE users SET reset_token_hash = ?, reset_expires = ? WHERE id = ?',
      tokenHash, expires, user.id);
    const base = c.env.APP_URL || new URL(c.req.url).origin;
    const link = `${base}/reset-password/${token}`;
    const html = emailShell(ctx.settings, `
      <p>Hi ${user.first_name || 'there'},</p>
      <p>We received a request to reset your password. Click below to choose a new one. This link expires in 24 hours.</p>
      <p style="margin:20px 0"><a href="${link}" style="background:${ctx.settings?.primary_color || '#4f46e5'};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Reset password</a></p>
      <p style="font-size:12px;color:#64748b">If you didn't request this, you can safely ignore this email.</p>`);
    const res = await sendEmail(c.env, ctx.settings, {
      to: email, subject: `Reset your password — ${ctx.settings?.church_name || 'GraceDesk'}`,
      html, type: 'password_reset', memberId: user.member_id,
    });
    if (!res.ok && !emailEnabled(ctx.settings, c.env)) devLink = link; // dev convenience
    await audit(c, 'update', 'user', user.id, { password_reset_requested: true });
  }
  return c.html(forgotPage(ctx, c.env, { sent: true, devLink }));
});

auth.get('/reset-password/:token', async (c) => {
  const ctx = c.get('ctx');
  const token = c.req.param('token');
  const tokenHash = await sha256Hex(token);
  const user = await one(c.env.DB, 'SELECT id, reset_expires FROM users WHERE reset_token_hash = ?', tokenHash);
  if (!user || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
    return c.html(resetPage(ctx, { invalid: true }));
  }
  return c.html(resetPage(ctx, { token }));
});

auth.post('/reset-password/:token', async (c) => {
  const ctx = c.get('ctx');
  const token = c.req.param('token');
  const form = await c.req.parseBody();
  const tokenHash = await sha256Hex(token);
  const user = await one(c.env.DB, 'SELECT * FROM users WHERE reset_token_hash = ?', tokenHash);
  if (!user || !user.reset_expires || new Date(user.reset_expires) < new Date()) {
    return c.html(resetPage(ctx, { invalid: true }));
  }
  if ((form.password || '').length < 8) return c.html(resetPage(ctx, { token, error: 'Password must be at least 8 characters.' }));
  if (form.password !== form.password2) return c.html(resetPage(ctx, { token, error: 'Passwords do not match.' }));

  const hash = await hashPassword(form.password);
  await run(
    c.env.DB,
    `UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires = NULL,
       must_change_password = 0, failed_login_attempts = 0, locked_until = NULL,
       is_active = CASE WHEN is_active = 0 AND member_id IS NOT NULL THEN is_active ELSE is_active END
     WHERE id = ?`,
    hash, user.id,
  );
  await audit(c, 'update', 'user', user.id, { password_reset: true });
  return c.redirect('/login');
});

// --- Change password (logged in / forced) ---------------------------------

auth.get('/change-password', requireAuth, (c) => {
  const ctx = c.get('ctx');
  return c.html(changePasswordPage({ ...ctx, csrf: '' }, { forced: !!ctx.user.must_change_password }));
});

auth.post('/change-password', requireAuth, async (c) => {
  const ctx = c.get('ctx');
  const user = ctx.user;
  const forced = !!user.must_change_password;
  const form = await c.req.parseBody();
  const fail = (error) => c.html(changePasswordPage({ ...ctx, csrf: '' }, { forced, error }));

  if (!forced) {
    const currentOk = await verifyPassword(form.current || '', user.password_hash);
    if (!currentOk) return fail('Your current password is incorrect.');
  }
  if ((form.password || '').length < 8) return fail('New password must be at least 8 characters.');
  if (form.password !== form.password2) return fail('Passwords do not match.');

  const hash = await hashPassword(form.password);
  await run(c.env.DB, 'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', hash, user.id);
  await audit(c, 'update', 'user', user.id, { password_changed: true });
  return c.redirect('/dashboard');
});
