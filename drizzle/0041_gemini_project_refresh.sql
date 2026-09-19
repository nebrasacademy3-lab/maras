-- Explicit operator opt-in only. No token or API key belongs in this registry.
ALTER TABLE gemini_projects ADD COLUMN plan_digest text CHECK (plan_digest IS NULL OR plan_digest ~ '^[a-f0-9]{64}$');
--> statement-breakpoint
CREATE TABLE gemini_project_refresh (
  project_number text PRIMARY KEY REFERENCES gemini_projects(project_number),
  plan_json text NOT NULL CHECK (octet_length(plan_json) BETWEEN 1 AND 65536),
  plan_digest text NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  plan_revision text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'disabled' CHECK (state IN ('disabled','verified','checking','failed')),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_id text,
  lease_until timestamptz,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 32),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text CHECK (last_error IN ('TOKEN_UNAVAILABLE','VERIFICATION_FAILED','PLAN_INVALID')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((lease_id IS NULL) = (lease_until IS NULL)),
  CHECK (enabled OR (state = 'disabled' AND lease_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX gemini_refresh_due_idx ON gemini_project_refresh(enabled, next_attempt_at);
