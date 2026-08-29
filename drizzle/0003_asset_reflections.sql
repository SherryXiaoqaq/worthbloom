ALTER TABLE assets ADD COLUMN archived_at TEXT;

CREATE TABLE IF NOT EXISTS asset_reflections (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  feeling TEXT,
  rating INTEGER,
  would_buy_again TEXT NOT NULL,
  note TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'MANUAL',
  usage_count INTEGER NOT NULL DEFAULT 0,
  cost_per_use REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_reflections_asset_id ON asset_reflections(asset_id);
