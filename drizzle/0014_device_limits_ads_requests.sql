ALTER TABLE "course_requests" ADD COLUMN IF NOT EXISTS "course_url" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "device_id" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "device_label" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "platform" text NOT NULL DEFAULT 'web';
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_device_idx" ON "auth_sessions" USING btree ("user_id","device_id","revoked_at");
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "template" text NOT NULL DEFAULT 'general';
--> statement-breakpoint
INSERT INTO "platform_settings" ("key","value","category","is_public","updated_at")
VALUES ('max_student_devices','2','security',false,CURRENT_TIMESTAMP::text)
ON CONFLICT ("key") DO NOTHING;
