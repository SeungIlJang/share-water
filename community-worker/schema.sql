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
