ALTER TABLE "course_request_files" ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0, ADD COLUMN "scan_last_attempt_at" text, ADD COLUMN "scan_next_attempt_at" text, ADD COLUMN "scan_sha256" text;
--> statement-breakpoint
CREATE INDEX "course_request_files_scan_queue_idx" ON "course_request_files" ("scan_status","scan_next_attempt_at","created_at");
--> statement-breakpoint
UPDATE "course_request_files" SET scan_status='pending', scanned_at=NULL WHERE scan_sha256 IS NULL AND scan_status='clean';
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0, ADD COLUMN "scan_last_attempt_at" text, ADD COLUMN "scan_next_attempt_at" text, ADD COLUMN "scan_sha256" text;
--> statement-breakpoint
CREATE INDEX "support_reply_files_scan_queue_idx" ON "support_reply_files" ("scan_status","scan_next_attempt_at","created_at");
--> statement-breakpoint
UPDATE "support_reply_files" SET scan_status='pending', scanned_at=NULL WHERE scan_sha256 IS NULL AND scan_status='clean';
--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0, ADD COLUMN "scan_last_attempt_at" text, ADD COLUMN "scan_next_attempt_at" text, ADD COLUMN "scan_sha256" text;
--> statement-breakpoint
CREATE INDEX "course_resources_scan_queue_idx" ON "course_resources" ("scan_status","scan_next_attempt_at","created_at");
--> statement-breakpoint
UPDATE "course_resources" SET scan_status='pending', scanned_at=NULL WHERE scan_sha256 IS NULL AND scan_status='clean';
--> statement-breakpoint
ALTER TABLE "ai_files" ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0, ADD COLUMN "scan_last_attempt_at" text, ADD COLUMN "scan_next_attempt_at" text, ADD COLUMN "scan_sha256" text;
--> statement-breakpoint
CREATE INDEX "ai_files_scan_queue_idx" ON "ai_files" ("scan_status","scan_next_attempt_at","created_at");
--> statement-breakpoint
UPDATE "ai_files" SET scan_status='pending', scanned_at=NULL, status=CASE WHEN status='ready' THEN 'pending_scan' ELSE status END WHERE scan_sha256 IS NULL AND scan_status='clean';
--> statement-breakpoint
ALTER TABLE course_waitlist ADD COLUMN enrollment_version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE course_access ADD COLUMN store_access_blocked_at text;
--> statement-breakpoint
UPDATE course_access SET store_access_blocked_at=revoked_at WHERE revoked_at IS NOT NULL;
--> statement-breakpoint
CREATE TABLE store_purchase_accounts (
user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
revenuecat_user_id text NOT NULL CONSTRAINT store_account_identity_unique UNIQUE, created_at text NOT NULL
);
--> statement-breakpoint
CREATE TABLE store_products (
product_key text PRIMARY KEY, ios_product_id text CONSTRAINT store_product_ios_unique UNIQUE, android_product_id text CONSTRAINT store_product_android_unique UNIQUE,
kind text NOT NULL CHECK (kind IN ('course','bundle','ai')), target_slug text, title text NOT NULL,
course_slugs_json text NOT NULL DEFAULT '[]', duration_days integer CHECK (duration_days BETWEEN 1 AND 3650),
status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
created_at text NOT NULL, updated_at text NOT NULL,
CHECK (kind <> 'ai' OR duration_days=30),
CHECK (ios_product_id IS NOT NULL OR android_product_id IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE store_transactions (
id text PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
product_key text NOT NULL REFERENCES store_products(product_key) ON DELETE RESTRICT,
provider_purchase_id text NOT NULL, transaction_id text NOT NULL,
store text NOT NULL CHECK (store IN ('app_store','play_store')),
environment text NOT NULL CHECK (environment IN ('sandbox','production')),
kind text NOT NULL, title text NOT NULL, course_slugs_json text NOT NULL, duration_days integer,
status text NOT NULL CHECK (status IN ('owned','refunded')),
purchased_at text NOT NULL, verified_at text NOT NULL, refunded_at text, created_at text NOT NULL,
CONSTRAINT store_transaction_unique UNIQUE(environment,store,transaction_id)
);
--> statement-breakpoint
CREATE INDEX store_transactions_user_date_idx ON store_transactions(user_id,purchased_at);
--> statement-breakpoint
CREATE TABLE store_course_grants (
id serial PRIMARY KEY, transaction_id text NOT NULL REFERENCES store_transactions(id) ON DELETE RESTRICT,
user_email text NOT NULL, course_slug text NOT NULL, starts_at text NOT NULL, expires_at text,
status text NOT NULL CHECK (status IN ('active','refunded')), CONSTRAINT store_course_grant_unique UNIQUE(transaction_id,course_slug)
);
--> statement-breakpoint
CREATE INDEX store_course_grant_access_idx ON store_course_grants(user_email,course_slug,status,expires_at);
--> statement-breakpoint
CREATE TABLE store_webhook_events (
event_id text PRIMARY KEY, event_type text NOT NULL, revenuecat_user_id text,
status text NOT NULL, received_at text NOT NULL, processed_at text
);
