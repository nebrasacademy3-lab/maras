-- Version 1 jobs keep their original execution path. Never invent chunk history
-- for a job whose provider request may already have been accepted.
ALTER TABLE ai_file_jobs
  ADD COLUMN processing_version integer NOT NULL DEFAULT 1 CHECK (processing_version IN (1,2)),
  ADD COLUMN source_fingerprint text CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$'),
  ADD COLUMN generation_config_json text,
  ADD COLUMN usage_event_id integer REFERENCES ai_usage_events(id) ON DELETE SET NULL,
  ADD COLUMN progress_json text,
  ADD COLUMN pause_requested boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE study_job_plans (
  job_id text PRIMARY KEY REFERENCES ai_file_jobs(id) ON DELETE CASCADE,
  plan_json text NOT NULL CHECK (octet_length(plan_json) <= 2097152),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
--> statement-breakpoint
CREATE TABLE study_job_parts (
  job_id text NOT NULL REFERENCES ai_file_jobs(id) ON DELETE CASCADE,
  part_id text NOT NULL CHECK (part_id ~ '^[0-9]{4}([.][01]){0,12}$'),
  parent_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','committed','superseded','review')),
  input_json text NOT NULL CHECK (octet_length(input_json) <= 2097152),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  result_json text CHECK (octet_length(result_json) <= 2097152),
  result_sha256 text CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[a-f0-9]{64}$'),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 12),
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  PRIMARY KEY (job_id, part_id),
  CHECK ((status='committed') = (result_json IS NOT NULL AND result_sha256 IS NOT NULL)),
  CHECK (parent_id IS NULL OR part_id IN (parent_id || '.0', parent_id || '.1'))
);
--> statement-breakpoint
CREATE INDEX study_job_parts_pending_idx ON study_job_parts(job_id, status, part_id);
--> statement-breakpoint
CREATE TABLE study_job_attempts (
  id text PRIMARY KEY, job_id text NOT NULL, part_id text NOT NULL,
  lease_owner text NOT NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','committed','rejected','uncertain','invalid','failed')),
  billable boolean NOT NULL DEFAULT true,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 100000000),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 100000000),
  model text NOT NULL, key_id integer, error_code text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  FOREIGN KEY(job_id,part_id) REFERENCES study_job_parts(job_id,part_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX study_job_attempts_job_idx ON study_job_attempts(job_id,status);
