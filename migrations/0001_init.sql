-- GraceDesk initial schema (Cloudflare D1 / SQLite) — MULTI-TENANT.
-- Many churches share one database; every tenant-scoped row carries church_id.
-- Tenancy model: pool (shared DB + church_id). See docs/PLANNING.md.

-- ---------------------------------------------------------------------------
-- Churches (tenants). A church is reached at /c/<slug>/...
-- ---------------------------------------------------------------------------
CREATE TABLE churches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,           -- url key, e.g. "first-baptist"
  name        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',  -- active | suspended
  plan        TEXT    NOT NULL DEFAULT 'free',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Per-church settings (one row per church). Display name lives on churches.name.
-- ---------------------------------------------------------------------------
CREATE TABLE church_settings (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id                   INTEGER NOT NULL UNIQUE REFERENCES churches(id) ON DELETE CASCADE,
  church_logo_key             TEXT,
  primary_color               TEXT    NOT NULL DEFAULT '#4f46e5',
  church_address_line1        TEXT,
  church_address_line2        TEXT,
  church_city                 TEXT,
  church_state                TEXT,
  church_zip                  TEXT,
  church_country              TEXT    NOT NULL DEFAULT 'USA',
  church_phone                TEXT,
  church_email                TEXT,
  church_website              TEXT,
  ein_tax_id                  TEXT,
  currency                    TEXT    NOT NULL DEFAULT 'USD',
  timezone                    TEXT    NOT NULL DEFAULT 'America/New_York',
  date_format                 TEXT    NOT NULL DEFAULT 'MM/DD/YYYY',
  resend_api_key              TEXT,
  default_from_email          TEXT,
  reply_to_email              TEXT,
  thankyou_subject_template   TEXT    NOT NULL DEFAULT '{church_name} — Thank you for your generous contribution',
  thankyou_intro_text         TEXT    NOT NULL DEFAULT 'Thank you for your generous contribution. Your giving supports the work and mission of our church.',
  email_image_url             TEXT,
  turnstile_site_key          TEXT,
  turnstile_secret_key        TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Platform operators (GraceDesk staff) — manage churches across the platform.
-- ---------------------------------------------------------------------------
CREATE TABLE platform_admins (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT,
  name           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Bible verses (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE bible_verses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  reference   TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_verses_church ON bible_verses(church_id);

-- ---------------------------------------------------------------------------
-- Families (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE families (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  family_name     TEXT    NOT NULL,
  head_member_id  INTEGER,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_families_church ON families(church_id);

-- ---------------------------------------------------------------------------
-- Members (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE members (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id          INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  family_id          INTEGER REFERENCES families(id) ON DELETE SET NULL,
  first_name         TEXT    NOT NULL,
  middle_name        TEXT,
  last_name          TEXT    NOT NULL,
  email              TEXT,
  phones             TEXT,
  dob_month          INTEGER,
  dob_day            INTEGER,
  anniversary_month  INTEGER,
  anniversary_day    INTEGER,
  address_line1      TEXT,
  address_line2      TEXT,
  city               TEXT,
  state              TEXT,
  postal_code        TEXT,
  country            TEXT,
  photo_key          TEXT,
  membership_status  TEXT    NOT NULL DEFAULT 'pending',
  family_role        TEXT,
  notes              TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_members_church ON members(church_id);
CREATE INDEX idx_members_family ON members(family_id);
CREATE INDEX idx_members_status ON members(church_id, membership_status);
CREATE UNIQUE INDEX idx_members_church_email ON members(church_id, email) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Users (login accounts, per church). Email is unique within a church.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id              INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  email                  TEXT    NOT NULL,
  password_hash          TEXT,
  first_name             TEXT    NOT NULL DEFAULT '',
  last_name              TEXT    NOT NULL DEFAULT '',
  is_admin               INTEGER NOT NULL DEFAULT 0,
  can_manage_admins      INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 0,
  must_change_password   INTEGER NOT NULL DEFAULT 0,
  member_id              INTEGER REFERENCES members(id) ON DELETE SET NULL,
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until           TEXT,
  reset_token_hash       TEXT,
  reset_expires          TEXT,
  last_login             TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_users_church_email ON users(church_id, email);
CREATE INDEX idx_users_member ON users(member_id);
CREATE INDEX idx_users_reset ON users(reset_token_hash);

-- ---------------------------------------------------------------------------
-- Contribution categories (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE contribution_categories (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id      INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  description    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_categories_church ON contribution_categories(church_id);

-- ---------------------------------------------------------------------------
-- Contributions (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE contributions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category_id     INTEGER REFERENCES contribution_categories(id) ON DELETE SET NULL,
  amount          REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  date            TEXT    NOT NULL,
  method          TEXT    NOT NULL DEFAULT 'cash',
  receipt_number  TEXT,
  notes           TEXT,
  entered_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  deleted_reason  TEXT,
  deleted_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contrib_church ON contributions(church_id);
CREATE INDEX idx_contrib_member ON contributions(member_id);
CREATE INDEX idx_contrib_date ON contributions(church_id, date);
CREATE INDEX idx_contrib_deleted ON contributions(church_id, is_deleted);

-- ---------------------------------------------------------------------------
-- Email logs (per church).
-- ---------------------------------------------------------------------------
CREATE TABLE email_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id        INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL,
  contribution_id  INTEGER REFERENCES contributions(id) ON DELETE SET NULL,
  email_type       TEXT    NOT NULL,
  subject          TEXT,
  recipient_email  TEXT,
  provider_id      TEXT,
  bible_verse_used TEXT,
  status           TEXT    NOT NULL DEFAULT 'queued',
  error_message    TEXT,
  sent_at          TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_logs_church ON email_logs(church_id);

-- ---------------------------------------------------------------------------
-- Report cache (per church; PDF bytes in R2 keyed by file_key).
-- ---------------------------------------------------------------------------
CREATE TABLE report_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id     INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  report_type   TEXT    NOT NULL,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER,
  file_key      TEXT    NOT NULL,
  generated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  is_valid      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_report_cache_lookup ON report_cache(church_id, member_id, report_type, period_year, period_month);

-- ---------------------------------------------------------------------------
-- Audit log (per church, append-only).
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id    INTEGER REFERENCES churches(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT    NOT NULL,
  entity_type  TEXT,
  entity_id    INTEGER,
  details      TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_church ON audit_logs(church_id, created_at);

-- ---------------------------------------------------------------------------
-- Login attempts (per church, for progressive lockout).
-- ---------------------------------------------------------------------------
CREATE TABLE login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id    INTEGER REFERENCES churches(id) ON DELETE CASCADE,
  email        TEXT,
  ip_address   TEXT,
  successful   INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts_email ON login_attempts(church_id, email, attempted_at);

-- ---------------------------------------------------------------------------
-- Sessions (cookie id -> user + church).
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  data        TEXT,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
