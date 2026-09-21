-- More optional modules (all default OFF, toggled per church in Settings) plus
-- supporting tables for pledges, groups, attendance, pastoral notes, and email
-- delivery tracking.

ALTER TABLE church_settings ADD COLUMN pledges_enabled    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE church_settings ADD COLUMN groups_enabled     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE church_settings ADD COLUMN attendance_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE church_settings ADD COLUMN notes_enabled      INTEGER NOT NULL DEFAULT 0;

-- Pledges: an annual giving commitment per member (actual is derived from gifts).
CREATE TABLE pledges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  amount      REAL    NOT NULL,
  notes       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_pledges_church ON pledges(church_id, year);
CREATE UNIQUE INDEX idx_pledges_uniq ON pledges(church_id, member_id, year);

-- Groups / ministries (choir, youth, small groups).
CREATE TABLE member_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  description TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_member_groups_church ON member_groups(church_id);

CREATE TABLE group_memberships (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  group_id    INTEGER NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_group_memberships_uniq ON group_memberships(group_id, member_id);
CREATE INDEX idx_group_memberships_group ON group_memberships(group_id);

-- Attendance: aggregate head counts per service/date (no individual tracking).
CREATE TABLE attendance (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id     INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  date          TEXT    NOT NULL,
  service_name  TEXT,
  count         INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attendance_church ON attendance(church_id, date);

-- Pastoral care notes (sensitive; module off by default, admin-only).
CREATE TABLE member_notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id     INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  body          TEXT    NOT NULL,
  created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_member_notes_member ON member_notes(member_id);

-- Email delivery tracking (updated by the Resend webhook).
ALTER TABLE email_logs ADD COLUMN updated_at TEXT;
