CREATE TABLE IF NOT EXISTS oauth_transients (
  key_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('state', 'result')),
  payload TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_transients_expires_at
  ON oauth_transients (expires_at);

CREATE TABLE IF NOT EXISTS oauth_sessions (
  session_hash TEXT PRIMARY KEY,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
