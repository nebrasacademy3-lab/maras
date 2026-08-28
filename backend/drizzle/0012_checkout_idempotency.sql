ALTER TABLE "orders" ADD COLUMN "checkout_attempt_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_request_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_expires_at" text;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_attempt_unique" ON "orders" USING btree ("checkout_attempt_hash");