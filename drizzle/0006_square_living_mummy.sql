CREATE TABLE "support_reply_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"reply_id" integer NOT NULL,
	"ticket_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_replies" ALTER COLUMN "body" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "support_replies" ADD COLUMN "author_role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "contact_channel" text DEFAULT 'in_app' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_reply_files_object_unique" ON "support_reply_files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "support_reply_files_reply_idx" ON "support_reply_files" USING btree ("reply_id");--> statement-breakpoint
CREATE INDEX "support_reply_files_ticket_idx" ON "support_reply_files" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_replies_author_idx" ON "support_replies" USING btree ("author_email","created_at");