CREATE TABLE IF NOT EXISTS review_invites (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  used_by TEXT,
  used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_invites_request_id
ON review_invites(request_id);

PRAGMA optimize;
