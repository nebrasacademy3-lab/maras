ALTER TABLE "catalog_courses" ADD COLUMN IF NOT EXISTS "enrollment_mode" text DEFAULT 'auto' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_courses_enrollment_mode_check' AND conrelid = 'catalog_courses'::regclass) THEN
    ALTER TABLE catalog_courses ADD CONSTRAINT catalog_courses_enrollment_mode_check CHECK (enrollment_mode IN ('auto', 'open', 'closed'));
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_operations" (
  "operation_id" text PRIMARY KEY NOT NULL,
  "actor_user_id" integer NOT NULL CONSTRAINT "admin_operations_actor_user_id_users_id_fk" REFERENCES users(id),
  "student_user_id" integer NOT NULL CONSTRAINT "admin_operations_student_user_id_users_id_fk" REFERENCES users(id),
  "action" text NOT NULL,
  "request_hash" text NOT NULL,
  "result_json" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_operations_student_created_idx" ON "admin_operations" ("student_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_waitlist_dispatch_idx" ON "course_waitlist" ("status", "course_slug", "created_at", "id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_access_course_user_idx" ON "course_access" ("course_slug", "user_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "audit_logs" ("created_at");
--> statement-breakpoint
ALTER TABLE "course_waitlist" ADD COLUMN IF NOT EXISTS "activation_version" integer DEFAULT 1 NOT NULL;

--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_ai_entitlements_account ON ai_entitlements;
--> statement-breakpoint
CREATE TRIGGER sync_ai_entitlements_account AFTER INSERT OR UPDATE OR DELETE ON ai_entitlements FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();

--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_course_waitlist_account ON course_waitlist;
--> statement-breakpoint
CREATE TRIGGER sync_course_waitlist_account AFTER INSERT OR UPDATE OR DELETE ON course_waitlist FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();

--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_push_devices_account ON push_devices;
--> statement-breakpoint
CREATE TRIGGER sync_push_devices_account AFTER INSERT OR UPDATE OR DELETE ON push_devices FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
