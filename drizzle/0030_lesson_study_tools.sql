CREATE TABLE "ai_file_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"result_json" text NOT NULL,
	"created_at" text NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_file_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"action" text NOT NULL,
	"client" text NOT NULL,
	"options_json" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"available_at" text NOT NULL,
	"lease_until" text,
	"lease_owner" text,
	"result_json" text,
	"error_code" text,
	"error_message" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_work_leases" (
	"key" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_files" ADD COLUMN "source_resource_id" integer;--> statement-breakpoint
ALTER TABLE "course_resources" ADD COLUMN "lesson_id" text;--> statement-breakpoint
ALTER TABLE "ai_file_jobs" ADD CONSTRAINT "ai_file_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_file_jobs" ADD CONSTRAINT "ai_file_jobs_file_id_ai_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_file_jobs" ADD CONSTRAINT "ai_file_jobs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_file_cache_expiry_idx" ON "ai_file_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_file_jobs_request_unique" ON "ai_file_jobs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ai_file_jobs_queue_idx" ON "ai_file_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "ai_file_jobs_user_idx" ON "ai_file_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "ai_file_jobs_lease_idx" ON "ai_file_jobs" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "ai_work_leases_expiry_idx" ON "ai_work_leases" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;