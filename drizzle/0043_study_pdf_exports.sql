-- Bounded derived exports only; never rewrites/deletes historical study results.
-- Cache expiry removes only PDFs, never the text needed to re-render without AI.
CREATE TABLE study_pdf_exports (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artifact_id integer NOT NULL REFERENCES ai_artifacts(id) ON DELETE CASCADE,
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  renderer_version text NOT NULL,
  status text NOT NULL DEFAULT 'rendering' CHECK (status IN ('rendering','ready','failed')),
  owner uuid,
  lease_until timestamptz,
  data bytea CHECK (octet_length(data) BETWEEN 100 AND 8388608),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^PDF_[A-Z_]+$'),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK ((status='rendering') = (owner IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((status='ready') = (data IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK (status='rendering' OR (owner IS NULL AND lease_until IS NULL)),
  CHECK (status='ready' OR (data IS NULL AND sha256 IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX study_pdf_owner_input_unique ON study_pdf_exports(user_id, artifact_id, input_digest);
--> statement-breakpoint
CREATE INDEX study_pdf_expiry_idx ON study_pdf_exports(expires_at);
--> statement-breakpoint
CREATE INDEX study_pdf_rendering_idx ON study_pdf_exports(status, lease_until);
