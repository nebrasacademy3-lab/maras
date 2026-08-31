ALTER TABLE "lesson_notes" ADD COLUMN IF NOT EXISTS "timestamp_seconds" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD COLUMN IF NOT EXISTS "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text;
--> statement-breakpoint
DROP INDEX IF EXISTS "lesson_notes_user_lesson_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_notes_user_lesson_idx" ON "lesson_notes" USING btree ("user_email","lesson_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_notes_lesson_time_idx" ON "lesson_notes" USING btree ("lesson_id","timestamp_seconds");
--> statement-breakpoint
INSERT INTO "platform_settings" ("key","value","category","is_public","updated_at")
VALUES ('content_view_mode','both','security',false,CURRENT_TIMESTAMP::text)
ON CONFLICT ("key") DO NOTHING;
