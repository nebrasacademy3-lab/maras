-- Stable user ownership for account-scoped records. Email columns remain historical/display snapshots.
CREATE TABLE IF NOT EXISTS "user_ownership_reviews" (
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "email_snapshot" text,
  "reason" text NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  PRIMARY KEY ("entity_type", "entity_id")
);--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "course_access" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "course_access_events" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "lesson_notes" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "course_reviews" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "course_waitlist" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "store_course_grants" ADD COLUMN IF NOT EXISTS "user_id" integer REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint

UPDATE "course_access" ca SET "user_id"=o."user_id" FROM "orders" o
WHERE ca."user_id" IS NULL AND ca."order_number"=o."order_number" AND o."user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "store_course_grants" g SET "user_id"=t."user_id" FROM "store_transactions" t
WHERE g."user_id" IS NULL AND g."transaction_id"=t."id";--> statement-breakpoint
UPDATE "course_access_events" e SET "user_id"=a."user_id" FROM "course_access" a
WHERE e."user_id" IS NULL AND e."access_id"=a."id" AND a."user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "course_access_events" e SET "user_id"=o."user_id" FROM "orders" o
WHERE e."user_id" IS NULL AND e."order_number"=o."order_number" AND o."user_id" IS NOT NULL;--> statement-breakpoint

-- Conservative email backfill. Any address seen in an email-change flow stays unresolved for offline review.
UPDATE "support_tickets" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND r."user_email" IS NOT NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "course_access" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "course_access_events" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "lesson_progress" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "favorites" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "cart_items" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "lesson_notes" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "course_reviews" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint
UPDATE "course_waitlist" r SET "user_id"=u."id" FROM "users" u WHERE r."user_id" IS NULL AND lower(r."user_email")=lower(u."email")
AND NOT EXISTS (SELECT 1 FROM "email_change_requests" e WHERE lower(e."current_email")=lower(r."user_email") OR lower(e."new_email")=lower(r."user_email"));--> statement-breakpoint

INSERT INTO "user_ownership_reviews" ("entity_type","entity_id","email_snapshot","reason")
SELECT 'support_ticket',"id"::text,"user_email",'email_not_safely_resolved' FROM "support_tickets" WHERE "user_id" IS NULL AND "user_email" IS NOT NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'course_access',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "course_access" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'course_access_event',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "course_access_events" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'lesson_progress',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "lesson_progress" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'favorite',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "favorites" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'cart_item',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "cart_items" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'lesson_note',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "lesson_notes" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'course_review',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "course_reviews" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'course_waitlist',"id"::text,"user_email",'email_not_safely_resolved',CURRENT_TIMESTAMP::text FROM "course_waitlist" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "user_ownership_reviews" SELECT 'store_course_grant',"id"::text,"user_email",'transaction_owner_missing',CURRENT_TIMESTAMP::text FROM "store_course_grants" WHERE "user_id" IS NULL ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP INDEX IF EXISTS "course_access_user_course_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "course_access_events_access_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "lesson_progress_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "favorites_user_course_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "cart_items_user_course_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "cart_items_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "lesson_notes_user_lesson_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "course_reviews_user_course_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "course_waitlist_user_course_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "store_course_grant_access_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "course_access_owner_course_unique" ON "course_access" ("user_id","course_slug");--> statement-breakpoint
CREATE INDEX "course_access_owner_idx" ON "course_access" ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "course_access_events_access_idx" ON "course_access_events" ("user_id","course_slug","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_owner_lesson_unique" ON "lesson_progress" ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_owner_course_idx" ON "lesson_progress" ("user_id","course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_owner_course_unique" ON "favorites" ("user_id","course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_owner_course_unique" ON "cart_items" ("user_id","course_slug");--> statement-breakpoint
CREATE INDEX "cart_items_user_idx" ON "cart_items" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "lesson_notes_user_lesson_idx" ON "lesson_notes" ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_reviews_owner_course_unique" ON "course_reviews" ("user_id","course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "course_waitlist_owner_course_unique" ON "course_waitlist" ("user_id","course_slug");--> statement-breakpoint
CREATE INDEX "store_course_grant_access_idx" ON "store_course_grants" ("user_id","course_slug","status","expires_at");--> statement-breakpoint
CREATE INDEX "support_user_id_idx" ON "support_tickets" ("user_id","updated_at");
