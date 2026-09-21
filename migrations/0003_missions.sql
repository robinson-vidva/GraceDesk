-- Optional "Missions" module: track supported mission churches / schools
-- (headcounts only, no individual names) and the support money sent to them.
-- Activated per church via church_settings.missions_enabled.

ALTER TABLE church_settings ADD COLUMN missions_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE mission_sites (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id       INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,                 -- label / location, e.g. "Nairobi, Kenya"
  type            TEXT    NOT NULL DEFAULT 'church', -- church | school
  country         TEXT,
  pastors_count   INTEGER NOT NULL DEFAULT 0,       -- for church sites
  teachers_count  INTEGER NOT NULL DEFAULT 0,       -- for school sites
  students_count  INTEGER NOT NULL DEFAULT 0,       -- for school sites
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mission_sites_church ON mission_sites(church_id);

CREATE TABLE mission_support (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  church_id      INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  site_id        INTEGER NOT NULL REFERENCES mission_sites(id) ON DELETE CASCADE,
  amount         REAL    NOT NULL,
  currency       TEXT    NOT NULL DEFAULT 'USD',
  date           TEXT    NOT NULL,
  method         TEXT    NOT NULL DEFAULT 'bank_transfer',
  notes          TEXT,
  entered_by_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_mission_support_site ON mission_support(site_id);
CREATE INDEX idx_mission_support_church ON mission_support(church_id);
