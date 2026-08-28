CREATE TABLE "notification_reads" (
	"notification_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "notification_reads_pk" PRIMARY KEY("notification_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "catalog_courses" ALTER COLUMN "price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "catalog_courses" ALTER COLUMN "old_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "coupons" ALTER COLUMN "value" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_amount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "discount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_reserved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_reservation_expires_at" text;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_reads_user_idx" ON "notification_reads" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiry_idx" ON "auth_rate_limits" USING btree ("window_expires_at");--> statement-breakpoint
CREATE INDEX "orders_coupon_reservation_idx" ON "orders" USING btree ("coupon_reserved","coupon_reservation_expires_at");
--> statement-breakpoint
-- Preserve read state for legacy direct notifications while moving all future
-- state to the per-user join table. Broadcast read_at values are intentionally
-- not copied because they cannot identify the reader safely.
INSERT INTO "notification_reads" ("notification_id", "user_id", "read_at")
SELECT n."id", u."id", n."read_at"
FROM "notifications" n
INNER JOIN "users" u ON lower(u."email") = lower(n."user_email")
WHERE n."user_email" IS NOT NULL AND n."read_at" IS NOT NULL
ON CONFLICT ("notification_id", "user_id") DO UPDATE SET "read_at" = EXCLUDED."read_at";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_notification_read_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	user_key text := COALESCE(NEW.user_id::text, OLD.user_id::text);
BEGIN
	IF user_key IS NOT NULL THEN
		PERFORM meras_touch_sync('notifications', 'user:' || user_key);
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_notification_reads_scoped
AFTER INSERT OR UPDATE OR DELETE ON "notification_reads"
FOR EACH ROW EXECUTE FUNCTION meras_sync_notification_read_row();
