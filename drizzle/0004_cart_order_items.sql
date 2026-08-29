CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"course_slug" text NOT NULL,
	"unit_price" real NOT NULL,
	"discount" real DEFAULT 0 NOT NULL,
	"total" real NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_user_course_unique" ON "cart_items" USING btree ("user_email","course_slug");--> statement-breakpoint
CREATE INDEX "cart_items_user_idx" ON "cart_items" USING btree ("user_email","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_course_unique" ON "order_items" USING btree ("order_number","course_slug");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "order_items_course_idx" ON "order_items" USING btree ("course_slug");