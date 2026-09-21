import { run } from '../db.js';

// Append-only audit log. `c` is the Hono context (for user + request meta).
export async function audit(c, action, entityType = null, entityId = null, details = null) {
  const ctx = c.get('ctx');
  const user = ctx?.user;
  const churchId = ctx?.church?.id ?? null;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
  const ua = c.req.header('user-agent') || '';
  try {
    await run(
      c.env.DB,
      `INSERT INTO audit_logs (church_id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      churchId, user?.id ?? null, action, entityType, entityId,
      details ? JSON.stringify(details) : null, ip, ua,
    );
  } catch (err) {
    console.error('audit failed', err);
  }
}
