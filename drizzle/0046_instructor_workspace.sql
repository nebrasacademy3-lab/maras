-- Additive instructor workspace. Existing student/catalog/financial rows are untouched.
CREATE TABLE instructor_profiles (
 user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
 country text NOT NULL, gender text NOT NULL CHECK (gender IN ('male','female')),
 qualification text NOT NULL, specialty text NOT NULL, address_encrypted text NOT NULL,
 bio text NOT NULL DEFAULT '', teaching_subjects text NOT NULL DEFAULT '',
 compensation_model text NOT NULL DEFAULT 'hourly' CHECK (compensation_model IN ('hourly','course')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','changes_requested','approved','rejected','suspended')),
 review_notes text NOT NULL DEFAULT '', bank_encrypted text, submitted_at text,
 reviewed_by integer REFERENCES users(id), reviewed_at text, revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX instructor_profiles_status_idx ON instructor_profiles(status, created_at);
--> statement-breakpoint
CREATE TABLE instructor_documents (
 id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES instructor_profiles(user_id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('identity_front','identity_back','passport','selfie','cv','certificate')),
 object_key text NOT NULL, storage_provider text NOT NULL CHECK (storage_provider IN ('local','s3')),
 original_name text NOT NULL, content_type text NOT NULL, size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
 sha256 text NOT NULL, expires_at text, identity_legal_basis text,
 scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending','clean','quarantined')),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX instructor_documents_owner_idx ON instructor_documents(user_id, kind);
CREATE UNIQUE INDEX instructor_document_object_unique ON instructor_documents(object_key);
CREATE INDEX instructor_documents_expiry_idx ON instructor_documents(expires_at) WHERE expires_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE instructor_contracts (
 id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES instructor_profiles(user_id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK (version > 0), status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','offered','signed','withdrawn','terminated')),
 title text NOT NULL, terms_ar text NOT NULL, terms_en text NOT NULL,
 compensation_model text NOT NULL CHECK (compensation_model IN ('hourly','course')),
 rate_halalas integer NOT NULL CHECK (rate_halalas > 0 AND rate_halalas <= 100000000),
 employment_json text NOT NULL DEFAULT '{}', trial_days integer NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 0 AND 180),
 trial_terms_ar text NOT NULL, trial_terms_en text NOT NULL, organization_json text NOT NULL, instructor_json text NOT NULL,
 content_hash text, signature_json text, signature_hash text, signed_ip text, signed_user_agent text,
 created_by integer NOT NULL REFERENCES users(id), offered_at text, signed_at text,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
 CONSTRAINT instructor_contract_owner_unique UNIQUE(id,user_id),
 CONSTRAINT instructor_signed_evidence_check CHECK (status NOT IN ('signed','terminated') OR (content_hash IS NOT NULL AND signature_json IS NOT NULL AND signature_hash IS NOT NULL AND signed_at IS NOT NULL))
);
CREATE UNIQUE INDEX instructor_contract_version_unique ON instructor_contracts(user_id,version);
CREATE INDEX instructor_contract_status_idx ON instructor_contracts(user_id,status);
CREATE UNIQUE INDEX instructor_contract_active_unique ON instructor_contracts(user_id) WHERE status = 'signed';
--> statement-breakpoint
CREATE TABLE instructor_assignments (
 id serial PRIMARY KEY, user_id integer NOT NULL REFERENCES instructor_profiles(user_id) ON DELETE RESTRICT,
 course_slug text NOT NULL REFERENCES catalog_courses(slug) ON DELETE RESTRICT,
 contract_id integer NOT NULL, assigned_by integer NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','submitted','changes_requested','published','cancelled')),
 instructions text NOT NULL DEFAULT '', review_notes text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 submitted_at text, published_at text, created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
 CONSTRAINT instructor_assignment_contract_owner_fk FOREIGN KEY(contract_id,user_id) REFERENCES instructor_contracts(id,user_id) ON DELETE RESTRICT
);
CREATE INDEX instructor_assignments_owner_idx ON instructor_assignments(user_id,status);
CREATE UNIQUE INDEX instructor_assignment_course_unique ON instructor_assignments(course_slug) WHERE status <> 'cancelled';
--> statement-breakpoint
CREATE TABLE instructor_units (
 id serial PRIMARY KEY, assignment_id integer NOT NULL REFERENCES instructor_assignments(id) ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0 CHECK (position >= 0)
);
CREATE INDEX instructor_units_assignment_idx ON instructor_units(assignment_id,position);
CREATE TABLE instructor_lessons (
 id serial PRIMARY KEY, unit_id integer NOT NULL REFERENCES instructor_units(id) ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
 video_asset_id integer REFERENCES video_assets(id) ON DELETE RESTRICT,
 duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
 created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);
CREATE INDEX instructor_lessons_unit_idx ON instructor_lessons(unit_id,position);
--> statement-breakpoint
-- Once offered, the exact terms are frozen. A different agreement needs a new version.
CREATE FUNCTION guard_instructor_contract_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD.status IN ('offered','signed','terminated') THEN RAISE EXCEPTION 'Contract evidence is immutable'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.status IN ('signed','terminated') THEN
  IF (to_jsonb(NEW) - ARRAY['status','updated_at','revision']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at','revision'])
   OR NOT (OLD.status = 'signed' AND NEW.status = 'terminated') THEN
   RAISE EXCEPTION 'Signed contract evidence is immutable';
  END IF;
 ELSIF OLD.status = 'offered' THEN
  IF (to_jsonb(NEW) - ARRAY['status','updated_at','revision','signature_json','signature_hash','signed_ip','signed_user_agent','signed_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at','revision','signature_json','signature_hash','signed_ip','signed_user_agent','signed_at'])
   OR NEW.status NOT IN ('signed','withdrawn') THEN
   RAISE EXCEPTION 'Offered contract terms are immutable';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER instructor_contract_evidence_guard BEFORE UPDATE OR DELETE ON instructor_contracts FOR EACH ROW EXECUTE FUNCTION guard_instructor_contract_evidence();
