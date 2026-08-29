ALTER TABLE agent_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'SINGLE';
ALTER TABLE agent_sessions ADD COLUMN agent_profile_id TEXT NOT NULL DEFAULT 'QUICK_DECISION';
ALTER TABLE agent_sessions ADD COLUMN prompt_version TEXT NOT NULL DEFAULT 'prompt_v1';
ALTER TABLE agent_sessions ADD COLUMN summary TEXT;
ALTER TABLE agent_sessions ADD COLUMN metadata_json TEXT;

ALTER TABLE agent_messages ADD COLUMN agent_profile_id TEXT;
ALTER TABLE agent_messages ADD COLUMN payload_json TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_request_updated
  ON agent_sessions(request_id, updated_at);
