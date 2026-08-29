CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"anonymous_id" text,
	"user_email" text,
	"course_slug" text,
	"metadata_json" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before_json" text,
	"after_json" text,
	"ip_address" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_expires_at" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" text NOT NULL,
	"revoked_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_courses" (
	"slug" text PRIMARY KEY NOT NULL,
	"institution_slug" text NOT NULL,
	"specialty_slug" text NOT NULL,
	"title" text NOT NULL,
	"title_en" text DEFAULT '' NOT NULL,
	"code" text,
	"description" text DEFAULT '' NOT NULL,
	"price" real DEFAULT 0 NOT NULL,
	"old_price" real,
	"access_label" text DEFAULT '90 يومًا' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"cover_theme" text DEFAULT 'blue-violet' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_institutions" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"region" text NOT NULL,
	"type" text NOT NULL,
	"logo_url" text,
	"domain" text,
	"status" text DEFAULT 'published' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_specialties" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'percent' NOT NULL,
	"value" real NOT NULL,
	"course_slug" text,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" text,
	"expires_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"source" text DEFAULT 'purchase' NOT NULL,
	"order_number" text,
	"starts_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"expires_at" text,
	"revoked_at" text
);
--> statement-breakpoint
CREATE TABLE "course_request_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"university" text NOT NULL,
	"university_slug" text,
	"specialty" text NOT NULL,
	"course_name" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"notify" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_supervisor_id" integer,
	"attachments_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_slug" text NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_specialties" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_slug" text NOT NULL,
	"specialty_slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'published' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"order_number" text NOT NULL,
	"customer_email" text NOT NULL,
	"total" real NOT NULL,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"issued_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"pdf_object_key" text
);
--> statement-breakpoint
CREATE TABLE "lesson_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"lesson_id" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"course_slug" text NOT NULL,
	"lesson_id" text NOT NULL,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"course_slug" text NOT NULL,
	"unit_id" integer NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"free_preview" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"video_asset_id" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_email" text,
	"audience" text DEFAULT 'user' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"action_url" text,
	"read_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"course_slug" text NOT NULL,
	"subtotal" real NOT NULL,
	"discount" real DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"total" real NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tap_charge_id" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"paid_at" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"destination_hash" text NOT NULL,
	"channel" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'tap' NOT NULL,
	"provider_event_id" text,
	"order_number" text,
	"charge_id" text,
	"status" text NOT NULL,
	"payload" text NOT NULL,
	"received_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_by" text,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"permission" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisor_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"supervisor_id" integer NOT NULL,
	"institution_slug" text,
	"specialty" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" text NOT NULL,
	"user_email" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"granted_by" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"full_name" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'student' NOT NULL,
	"email_verified_at" text,
	"phone_verified_at" text,
	"university_slug" text,
	"specialty" text,
	"profile_completed_at" text,
	"onboarding_completed_at" text,
	"last_login_at" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_slug" text NOT NULL,
	"lesson_id" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"duration_seconds" integer,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_event_idx" ON "analytics_events" USING btree ("event");--> statement-breakpoint
CREATE INDEX "analytics_course_idx" ON "analytics_events" USING btree ("course_slug");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_email");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "catalog_courses_institution_idx" ON "catalog_courses" USING btree ("institution_slug");--> statement-breakpoint
CREATE INDEX "catalog_courses_specialty_idx" ON "catalog_courses" USING btree ("specialty_slug");--> statement-breakpoint
CREATE INDEX "catalog_courses_status_idx" ON "catalog_courses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_institutions_region_idx" ON "catalog_institutions" USING btree ("region");--> statement-breakpoint
CREATE INDEX "catalog_institutions_status_idx" ON "catalog_institutions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_specialties_name_unique" ON "catalog_specialties" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_status_idx" ON "coupons" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "course_access_user_course_unique" ON "course_access" USING btree ("user_email","course_slug");--> statement-breakpoint
CREATE INDEX "course_access_course_idx" ON "course_access" USING btree ("course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "course_request_files_object_unique" ON "course_request_files" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "course_request_files_request_idx" ON "course_request_files" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "course_requests_course_idx" ON "course_requests" USING btree ("course_name");--> statement-breakpoint
CREATE INDEX "course_requests_status_idx" ON "course_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_requests_user_idx" ON "course_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "course_requests_supervisor_idx" ON "course_requests" USING btree ("assigned_supervisor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "course_reviews_user_course_unique" ON "course_reviews" USING btree ("user_email","course_slug");--> statement-breakpoint
CREATE INDEX "course_reviews_status_idx" ON "course_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "course_units_course_idx" ON "course_units" USING btree ("course_slug","position");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_user_course_unique" ON "favorites" USING btree ("user_email","course_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_specialties_unique" ON "institution_specialties" USING btree ("institution_slug","specialty_slug");--> statement-breakpoint
CREATE INDEX "institution_specialties_lookup_idx" ON "institution_specialties" USING btree ("institution_slug","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_unique" ON "invoices" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_notes_user_lesson_unique" ON "lesson_notes" USING btree ("user_email","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_progress_unique" ON "lesson_progress" USING btree ("user_email","lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_course_idx" ON "lesson_progress" USING btree ("course_slug");--> statement-breakpoint
CREATE INDEX "lessons_unit_idx" ON "lessons" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "lessons_course_idx" ON "lessons" USING btree ("course_slug");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_email","read_at");--> statement-breakpoint
CREATE INDEX "notifications_audience_idx" ON "notifications" USING btree ("audience");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tap_charge_unique" ON "orders" USING btree ("tap_charge_id");--> statement-breakpoint
CREATE INDEX "otp_destination_idx" ON "otp_challenges" USING btree ("destination_hash","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_token_unique" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_user_idx" ON "password_reset_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique" ON "payment_events" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_charge_idx" ON "payment_events" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "payment_events_order_idx" ON "payment_events" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "platform_settings_category_idx" ON "platform_settings" USING btree ("category","is_public");--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_unique" ON "push_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_unique" ON "role_permissions" USING btree ("role_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_unique" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "supervisor_assignments_unique" ON "supervisor_assignments" USING btree ("supervisor_id","institution_slug","specialty");--> statement-breakpoint
CREATE INDEX "supervisor_assignments_user_idx" ON "supervisor_assignments" USING btree ("supervisor_id","active");--> statement-breakpoint
CREATE INDEX "supervisor_assignments_scope_idx" ON "supervisor_assignments" USING btree ("institution_slug","specialty");--> statement-breakpoint
CREATE INDEX "support_replies_ticket_idx" ON "support_replies" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_ticket_number_unique" ON "support_tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "support_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_unique" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "video_object_key_unique" ON "video_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "video_lesson_idx" ON "video_assets" USING btree ("course_slug","lesson_id");