CREATE TABLE IF NOT EXISTS purchase_requests (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL, reason TEXT NOT NULL,
  category TEXT NOT NULL, total_units INTEGER, usage_frequency TEXT, expiry_date TEXT,
  product_url TEXT, similar_item TEXT, status TEXT NOT NULL DEFAULT 'REVIEWING',
  review_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, reviewer_name TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('BUY_NOW','SAVE_FIRST','WAIT')),
  comment TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS final_decisions (
  request_id TEXT PRIMARY KEY, decision TEXT NOT NULL, decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS saving_goals (
  id TEXT PRIMARY KEY, request_id TEXT UNIQUE, name TEXT NOT NULL, target REAL NOT NULL,
  current REAL NOT NULL DEFAULT 0, weekly_plan REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, request_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
  purchase_price REAL NOT NULL, total_units INTEGER, used_units INTEGER NOT NULL DEFAULT 0,
  current_balance REAL, expiry_date TEXT, usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, usage_type TEXT NOT NULL,
  amount REAL, note TEXT, client_event_id TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS device_states (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, health INTEGER NOT NULL, progress REAL NOT NULL DEFAULT 0,
  message TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_reviews_request_id ON reviews(request_id);
CREATE INDEX IF NOT EXISTS idx_usage_asset_id ON usage_records(asset_id);
