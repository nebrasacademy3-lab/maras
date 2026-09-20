CREATE TABLE IF NOT EXISTS apple_account_tokens (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  client_id text NOT NULL,
  ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at text NOT NULL,
  updated_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS apple_token_retry_idx ON apple_account_tokens(status,next_retry_at);
