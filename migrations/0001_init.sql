-- GraceDesk initial schema (Cloudflare D1 / SQLite)
-- Adapted from docs/PLANNING.md. One installation per deployment (single church).

-- ---------------------------------------------------------------------------
-- Church settings: exactly one row (id = 1) per installation.
-- ---------------------------------------------------------------------------
CREATE TABLE church_settings (
  id                          INTEGER PRIMARY KEY CHECK (id = 1),
  church_name                 TEXT    NOT NULL DEFAULT 'Your Church',
  church_logo_key             TEXT,                 -- R2 object key
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
  resend_api_key              TEXT,                 -- overrides env if set
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
-- Bible verses: rotated randomly into thank-you emails.
-- ---------------------------------------------------------------------------
CREATE TABLE bible_verses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reference   TEXT    NOT NULL,
  text        TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Families.
-- ---------------------------------------------------------------------------
CREATE TABLE families (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  family_name     TEXT    NOT NULL,
  head_member_id  INTEGER,               -- FK to members.id (set after member exists)
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Members: church directory profiles.
-- ---------------------------------------------------------------------------
CREATE TABLE members (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id          INTEGER REFERENCES families(id) ON DELETE SET NULL,
  first_name         TEXT    NOT NULL,
  middle_name        TEXT,
  last_name          TEXT    NOT NULL,
  email              TEXT    UNIQUE,
  phones             TEXT,                       -- JSON array of strings
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
  photo_key          TEXT,                       -- R2 object key
  membership_status  TEXT    NOT NULL DEFAULT 'pending', -- pending | active | inactive
  family_role        TEXT,                       -- head | spouse | child | parent | sibling | other
  notes              TEXT,                       -- admin only
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_members_family ON members(family_id);
CREATE INDEX idx_members_status ON members(membership_status);

-- ---------------------------------------------------------------------------
-- Users: login accounts. Email is the username. Linked 1:1 to a member.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT    NOT NULL UNIQUE,
  password_hash          TEXT,                    -- PBKDF2 (salt:iterations:hash), null until set
  first_name             TEXT    NOT NULL DEFAULT '',
  last_name              TEXT    NOT NULL DEFAULT '',
  is_admin               INTEGER NOT NULL DEFAULT 0,
  can_manage_admins      INTEGER NOT NULL DEFAULT 0,
  is_active              INTEGER NOT NULL DEFAULT 0,
  must_change_password   INTEGER NOT NULL DEFAULT 0,
  member_id              INTEGER REFERENCES members(id) ON DELETE SET NULL,
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until           TEXT,
  last_login             TEXT,
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_member ON users(member_id);

-- ---------------------------------------------------------------------------
-- Contribution categories.
-- ---------------------------------------------------------------------------
CREATE TABLE contribution_categories (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  description    TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Contributions.
-- ---------------------------------------------------------------------------
CREATE TABLE contributions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  category_id     INTEGER REFERENCES contribution_categories(id) ON DELETE SET NULL,
  amount          REAL    NOT NULL,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  date            TEXT    NOT NULL,                 -- YYYY-MM-DD
  method          TEXT    NOT NULL DEFAULT 'cash',  -- cash|check|zelle|bank_transfer|zeffy|stripe|paypal|other
  receipt_number  TEXT,                             -- YYYY-NNN
  notes           TEXT,
  entered_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  deleted_reason  TEXT,
  deleted_by_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deleted_at      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contrib_member ON contributions(member_id);
CREATE INDEX idx_contrib_date ON contributions(date);
CREATE INDEX idx_contrib_deleted ON contributions(is_deleted);

-- ---------------------------------------------------------------------------
-- Email logs.
-- ---------------------------------------------------------------------------
CREATE TABLE email_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL,
  contribution_id  INTEGER REFERENCES contributions(id) ON DELETE SET NULL,
  email_type       TEXT    NOT NULL,   -- thank_you|welcome|password_reset|invite|report
  subject          TEXT,
  recipient_email  TEXT,
  provider_id      TEXT,               -- Resend message id
  bible_verse_used TEXT,
  status           TEXT    NOT NULL DEFAULT 'queued', -- queued|sent|failed
  error_message    TEXT,
  sent_at          TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Report cache (metadata; PDF bytes live in R2 keyed by file_key).
-- ---------------------------------------------------------------------------
CREATE TABLE report_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  report_type   TEXT    NOT NULL,      -- monthly | annual
  period_year   INTEGER NOT NULL,
  period_month  INTEGER,               -- null for annual
  file_key      TEXT    NOT NULL,      -- R2 key
  generated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  is_valid      INTEGER NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only).
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT    NOT NULL,       -- login|logout|create|update|delete|approve|reject|promote|revoke|export|settings_change
  entity_type  TEXT,
  entity_id    INTEGER,
  details      TEXT,                   -- JSON
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- Login attempts (for progressive lockout).
-- ---------------------------------------------------------------------------
CREATE TABLE login_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT,
  ip_address   TEXT,
  successful   INTEGER NOT NULL DEFAULT 0,
  attempted_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts_email ON login_attempts(email, attempted_at);

-- ---------------------------------------------------------------------------
-- Sessions (cookie id -> user).
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,        -- random token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data        TEXT,                    -- JSON (csrf token, flash, etc.)
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
