-- Upload ownership is immutable even when the account is later removed.
-- No cascading FK: abandoned sessions must remain available to the cleanup worker.
CREATE TABLE "resumable_video_uploads" (
  "id" text PRIMARY KEY NOT NULL,
  "request_key" text NOT NULL,
  "owner_id" integer NOT NULL CHECK ("owner_id" > 0),
  "course_slug" text NOT NULL,
  "lesson_id" text NOT NULL,
  "object_key" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('local', 's3')),
  "location_fingerprint" text NOT NULL CHECK ("location_fingerprint" ~ '^[a-f0-9]{64}$'),
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL CHECK ("size_bytes" BETWEEN 1 AND 209715200),
  "hashes_json" text NOT NULL,
  "received_json" text NOT NULL DEFAULT '[]',
  "status" text NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'completed', 'expired', 'blocked')),
  "asset_id" integer,
  "expires_at" timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '24 hours'),
  "created_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updated_at" timestamptz NOT NULL DEFAULT clock_timestamp()
);--> statement-breakpoint
CREATE UNIQUE INDEX "resumable_owner_request_unique" ON "resumable_video_uploads" ("owner_id", "request_key");--> statement-breakpoint
CREATE INDEX "resumable_expiry_idx" ON "resumable_video_uploads" ("status", "expires_at");
