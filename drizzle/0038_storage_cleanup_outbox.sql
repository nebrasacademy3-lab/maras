-- Durable outbox: independent of deleted parents; deletion + enqueue commit together.
CREATE TABLE "storage_cleanup_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "object_key" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" IN ('local', 's3')),
  "operation" text NOT NULL CHECK ("operation" IN ('object', 'prefix')),
  "location_fingerprint" text NOT NULL CHECK ("location_fingerprint" ~ '^[a-f0-9]{64}$'),
  "source" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'completed', 'blocked')),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 12),
  "available_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "lease_until" timestamptz,
  "lease_token" text,
  "error_code" text,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "updated_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "storage_cleanup_lease_check" CHECK (
    ("status" = 'processing' AND "lease_token" IS NOT NULL AND "lease_until" IS NOT NULL)
    OR ("status" <> 'processing' AND "lease_token" IS NULL AND "lease_until" IS NULL)),
  CONSTRAINT "storage_cleanup_complete_check" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL))
);--> statement-breakpoint
CREATE INDEX "storage_cleanup_pending_idx" ON "storage_cleanup_jobs" ("available_at", "created_at", "id") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "storage_cleanup_lease_idx" ON "storage_cleanup_jobs" ("lease_until") WHERE "status" = 'processing';
