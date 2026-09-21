import { getSession } from './auth.js';
import { getSettings } from './services/settings.js';
import { one } from './db.js';

// Loads church settings + current user into c.get('ctx') for every request.
export async function loadContext(c, next) {
  const settings = await getSettings(c.env.DB);
  let user = null;
  const session = await getSession(c);
  if (session) {
    user = await one(c.env.DB, 'SELECT * FROM users WHERE id = ? AND is_active = 1', session.userId);
    if (user) c.set('session', session);
  }
  c.set('ctx', { settings, user });
  await next();
}

export function requireAuth(c, next) {
  const { user } = c.get('ctx');
  if (!user) return c.redirect('/login');
  // Force password change for default admin before anything else.
  if (user.must_change_password && !c.req.path.startsWith('/change-password') && !c.req.path.startsWith('/logout')) {
    return c.redirect('/change-password');
  }
  return next();
}

export function requireAdmin(c, next) {
  const { user } = c.get('ctx');
  if (!user) return c.redirect('/login');
  if (!user.is_admin) return c.text('Forbidden', 403);
  return next();
}

export function requireSuperAdmin(c, next) {
  const { user } = c.get('ctx');
  if (!user || !user.can_manage_admins) return c.text('Forbidden', 403);
  return next();
}
