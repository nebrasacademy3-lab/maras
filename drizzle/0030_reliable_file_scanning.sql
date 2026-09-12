-- Never mark an unscanned file clean. Legacy provider preserves the existing storage choice.
ALTER TABLE "course_request_files"
  ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "scan_next_attempt_at" text,
  ADD COLUMN "scan_lease_token" text,
  ADD COLUMN "scan_lease_until" text;
--> statement-breakpoint
ALTER TABLE "course_request_files" ADD COLUMN "storage_provider" text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
CREATE INDEX "course_request_files_scan_queue_idx" ON "course_request_files" ("scan_status", "scan_next_attempt_at", "scan_lease_until");
--> statement-breakpoint
UPDATE "course_request_files" SET "scan_status"='pending', "scanned_at"=NULL, "scan_error"='real_scanner_required'
  WHERE "scan_status"='clean' AND "scan_provider"='development-signature-check';
--> statement-breakpoint
ALTER TABLE "support_reply_files"
  ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "scan_next_attempt_at" text,
  ADD COLUMN "scan_lease_token" text,
  ADD COLUMN "scan_lease_until" text;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "storage_provider" text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
CREATE INDEX "support_reply_files_scan_queue_idx" ON "support_reply_files" ("scan_status", "scan_next_attempt_at", "scan_lease_until");
--> statement-breakpoint
UPDATE "support_reply_files" SET "scan_status"='pending', "scanned_at"=NULL, "scan_error"='real_scanner_required'
  WHERE "scan_status"='clean' AND "scan_provider"='development-signature-check';
--> statement-breakpoint
ALTER TABLE "course_resources"
  ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "scan_next_attempt_at" text,
  ADD COLUMN "scan_lease_token" text,
  ADD COLUMN "scan_lease_until" text;
--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "storage_provider" text NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
CREATE INDEX "course_resources_scan_queue_idx" ON "course_resources" ("scan_status", "scan_next_attempt_at", "scan_lease_until");
--> statement-breakpoint
UPDATE "course_resources" SET "scan_status"='pending', "scanned_at"=NULL, "student_visible"=false, "scan_error"='real_scanner_required'
  WHERE "scan_status"='clean' AND "scan_provider"='development-signature-check';
--> statement-breakpoint
ALTER TABLE "ai_files"
  ADD COLUMN "scan_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN "scan_next_attempt_at" text,
  ADD COLUMN "scan_lease_token" text,
  ADD COLUMN "scan_lease_until" text;
--> statement-breakpoint
CREATE INDEX "ai_files_scan_queue_idx" ON "ai_files" ("scan_status", "scan_next_attempt_at", "scan_lease_until");
--> statement-breakpoint
UPDATE "ai_files" SET "scan_status"='pending', "scanned_at"=NULL, "status"='pending_scan', "scan_error"='real_scanner_required'
  WHERE "scan_status"='clean' AND "scan_provider"='development-signature-check';
