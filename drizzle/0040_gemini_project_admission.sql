-- No legacy label or environment variable proves project identity or billing.
-- Intentionally empty on migration; generation stays closed until verified.
CREATE TABLE gemini_projects (
  project_number text PRIMARY KEY CHECK (project_number ~ '^[1-9][0-9]{5,20}$'),
  project_id text NOT NULL UNIQUE,
  billing_state text NOT NULL CHECK (billing_state IN ('unlinked','linked','disabled')),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  revision text NOT NULL,
  verified_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  CHECK (valid_until <= verified_at + interval '15 minutes')
);
--> statement-breakpoint
CREATE TABLE gemini_project_keys (
  fingerprint text PRIMARY KEY CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  project_number text NOT NULL REFERENCES gemini_projects(project_number),
  resource_name text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE INDEX gemini_project_keys_project_idx ON gemini_project_keys(project_number);
--> statement-breakpoint
CREATE TABLE gemini_project_limits (
  project_number text NOT NULL REFERENCES gemini_projects(project_number),
  model text NOT NULL,
  rpm integer NOT NULL CHECK (rpm BETWEEN 1 AND 6000),
  tpm integer NOT NULL CHECK (tpm BETWEEN 1 AND 100000000),
  rpd integer NOT NULL CHECK (rpd BETWEEN 1 AND 1000000),
  concurrent integer NOT NULL CHECK (concurrent BETWEEN 1 AND 32 AND concurrent <= rpm),
  input_tokens integer NOT NULL CHECK (input_tokens BETWEEN 1 AND 2000000 AND input_tokens <= tpm),
  output_tokens integer NOT NULL CHECK (output_tokens BETWEEN 1 AND 65536),
  enabled boolean NOT NULL DEFAULT true,
  backoff_until timestamptz,
  PRIMARY KEY (project_number, model)
);
--> statement-breakpoint
CREATE TABLE gemini_project_reservations (
  id text PRIMARY KEY,
  project_number text NOT NULL REFERENCES gemini_projects(project_number),
  fingerprint text NOT NULL,
  model text NOT NULL,
  revision text NOT NULL,
  input_tokens integer NOT NULL CHECK (input_tokens BETWEEN 0 AND 2000000),
  state text NOT NULL CHECK (state IN ('counting','running','settled','uncertain')),
  quota_day text NOT NULL,
  dispatch_day text,
  active_until timestamptz NOT NULL,
  window_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX gemini_reservations_quota_idx ON gemini_project_reservations(project_number, model, window_until);
--> statement-breakpoint
CREATE INDEX gemini_reservations_day_idx ON gemini_project_reservations(project_number, model, quota_day);
