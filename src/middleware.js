import { getSession } from './auth.js';
import { getSettings } from './services/settings.js';
import { getChurchBySlug } from './services/churches.js';
import { one } from './db.js';

// Resolves the tenant (church) from the :slug path param and loads its
// settings + the current user (only if the session belongs to this church).
// Sets c.get('ctx') = { church, settings, user, base }.
export async function loadChurchContext(c, next) {
  const slug = c.req.param('slug');
  const church = await getChurchBySlug(c.env.DB, slug);
  if (!church) return c.text('Church not found', 404);

  const base = `/c/${church.slug}`;
  const settings = await getSettings(c.env.DB, church.id);

  let user = null;
  const session = await getSession(c);
  if (session && session.churchId === church.id) {
    user = await one(
      c.env.DB,
      'SELECT * FROM users WHERE id = ? AND church_id = ? AND is_active = 1',
      session.userId, church.id,
    );
    if (user) c.set('session', session);
  }

  c.set('ctx', { church, settings, user, base });

  if (church.status === 'suspended' && !c.req.path.endsWith('/suspended')) {
    return c.redirect(`${base}/suspended`);
  }
  await next();
}

export function requireAuth(c, next) {
  const ctx = c.get('ctx');
  if (!ctx.user) return c.redirect(`${ctx.base}/login`);
  if (ctx.user.must_change_password
      && !c.req.path.endsWith('/change-password')
      && !c.req.path.endsWith('/logout')) {
    return c.redirect(`${ctx.base}/change-password`);
  }
  return next();
}

export function requireAdmin(c, next) {
  const ctx = c.get('ctx');
  if (!ctx.user) return c.redirect(`${ctx.base}/login`);
  if (!ctx.user.is_admin) return c.text('Forbidden', 403);
  return next();
}

export function requireSuperAdmin(c, next) {
  const ctx = c.get('ctx');
  if (!ctx.user || !ctx.user.can_manage_admins) return c.text('Forbidden', 403);
  return next();
}
