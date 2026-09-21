-- Platform operator layer + custom domains.

ALTER TABLE churches ADD COLUMN custom_domain TEXT;
CREATE INDEX idx_churches_domain ON churches(custom_domain);

-- Sessions for platform operators (separate from church users).
CREATE TABLE platform_sessions (
  id          TEXT PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_platform_sessions_expires ON platform_sessions(expires_at);
