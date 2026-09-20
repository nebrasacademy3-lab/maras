-- Durable staging survives account/conversation deletion until its cleanup is acknowledged.
CREATE TABLE study_upload_sessions (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9-]{36}$'),
  owner_id integer NOT NULL CHECK (owner_id > 0), request_key text NOT NULL,
  conversation_id integer, file_id integer REFERENCES ai_files(id) ON DELETE SET NULL,
  original_name text NOT NULL, content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  hashes_json text NOT NULL, received_json text NOT NULL DEFAULT '[]',
  object_key text NOT NULL UNIQUE, provider text NOT NULL CHECK (provider IN ('local','s3')),
  location_fingerprint text NOT NULL CHECK (location_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','expired','blocked')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (conversation_id IS NULL OR conversation_id > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX study_upload_owner_request_uq ON study_upload_sessions(owner_id, request_key);
--> statement-breakpoint
CREATE INDEX study_upload_expiry_idx ON study_upload_sessions(status, expires_at);
