ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_method" text NOT NULL DEFAULT 'tap';
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checkout_key" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "checkout_url" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_checkout_key_unique" ON "orders" USING btree ("checkout_key");
--> statement-breakpoint
ALTER TABLE "catalog_courses" ADD COLUMN IF NOT EXISTS "access_duration_days" integer NOT NULL DEFAULT 90;
--> statement-breakpoint
UPDATE "catalog_courses"
SET "access_duration_days" = LEAST(
	3650,
	GREATEST(
		1,
		CASE
			WHEN "access_label" ILIKE '%نهاية الترم%' THEN 120
			ELSE COALESCE(
				NULLIF(
					substring(
						translate("access_label", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
						FROM '[0-9]{1,4}'
					),
					''
				)::integer,
				90
			)
		END
	)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "access_duration_days" integer NOT NULL DEFAULT 90;
--> statement-breakpoint
UPDATE "order_items" AS item
SET "access_duration_days" = course."access_duration_days"
FROM "catalog_courses" AS course
WHERE course."slug" = item."course_slug";
--> statement-breakpoint
ALTER TABLE "course_access" ADD COLUMN IF NOT EXISTS "suspended_at" text;
--> statement-breakpoint
ALTER TABLE "course_access" ADD COLUMN IF NOT EXISTS "suspension_reason" text;
--> statement-breakpoint
ALTER TABLE "course_access" ADD COLUMN IF NOT EXISTS "revocation_reason" text;
--> statement-breakpoint
ALTER TABLE "course_access" ADD COLUMN IF NOT EXISTS "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_access_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"access_id" integer,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"action" text NOT NULL,
	"actor_email" text,
	"reason" text,
	"order_number" text,
	"before_json" text,
	"after_json" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_access_events_key_unique" ON "course_access_events" USING btree ("event_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_access_events_access_idx" ON "course_access_events" USING btree ("user_email","course_slug","created_at");
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dedupe_key" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "push_status" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "push_attempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "push_last_error" text;
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "push_delivered_at" DROP DEFAULT;
--> statement-breakpoint
UPDATE "notifications"
SET "push_status" = CASE WHEN "push_delivered_at" IS NOT NULL THEN 'legacy' ELSE 'pending' END;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_key_unique" ON "notifications" USING btree ("dedupe_key");
--> statement-breakpoint
ALTER TABLE "push_devices" ADD COLUMN IF NOT EXISTS "device_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_devices_device_idx" ON "push_devices" USING btree ("user_id","device_id","status");
