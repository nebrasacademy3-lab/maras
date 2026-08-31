ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "push_claimed_at" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_push_dispatch_idx" ON "notifications" USING btree ("push_enabled","push_status","push_claimed_at","starts_at");
