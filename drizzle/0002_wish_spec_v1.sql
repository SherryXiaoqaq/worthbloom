-- Wish Decision/Review Spec v1.0 migration
-- Adds revision/type/concern/brand/skuLabel/details/sourcePlatform/updatedAt
-- to purchase_requests; wish_images table; Review context fields; Agent tables;
-- Growth/Claim tables. Guarded by IF NOT EXISTS / column checks where possible.

ALTER TABLE purchase_requests ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE purchase_requests ADD COLUMN source_type TEXT;
ALTER TABLE purchase_requests ADD COLUMN type TEXT;
ALTER TABLE purchase_requests ADD COLUMN concern TEXT;
ALTER TABLE purchase_requests ADD COLUMN brand TEXT;
ALTER TABLE purchase_requests ADD COLUMN sku_label TEXT;
ALTER TABLE purchase_requests ADD COLUMN details TEXT;
ALTER TABLE purchase_requests ADD COLUMN source_platform TEXT;
ALTER TABLE purchase_requests ADD COLUMN updated_at TEXT;

ALTER TABLE reviews ADD COLUMN reviewer_role TEXT;
ALTER TABLE reviews ADD COLUMN stamp TEXT;
ALTER TABLE reviews ADD COLUMN reasons TEXT;
ALTER TABLE reviews ADD COLUMN note TEXT;
ALTER TABLE reviews ADD COLUMN request_revision INTEGER;
ALTER TABLE reviews ADD COLUMN wish_snapshot TEXT;
ALTER TABLE reviews ADD COLUMN legacy_context INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN claimed_by TEXT;
ALTER TABLE reviews ADD COLUMN claimed_at TEXT;

CREATE TABLE IF NOT EXISTS wish_images (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, is_cover INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, request_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS', question_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
  question_id TEXT, skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_reports (
  session_id TEXT PRIMARY KEY, report_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_accounts (
  user_id TEXT PRIMARY KEY, points INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS growth_ledger_entries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, points INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE, reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES growth_accounts(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claim_tokens (
  token_digest TEXT PRIMARY KEY, review_id TEXT NOT NULL, expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wish_images_request_id ON wish_images(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_request_id ON agent_sessions(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_growth_ledger_user ON growth_ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_claim_tokens_review_id ON claim_tokens(review_id);
