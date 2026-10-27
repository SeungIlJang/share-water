CREATE TABLE IF NOT EXISTS water_points (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_key TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS water_points_owner_created ON water_points(owner_hash, created_at);

-- Additive moderation tables; existing points and device ownership are retained.
CREATE TABLE IF NOT EXISTS water_reports (
  point_id TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(point_id, reporter_hash)
);
CREATE TABLE IF NOT EXISTS blocked_contributors (
  owner_hash TEXT PRIMARY KEY,
  blocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
