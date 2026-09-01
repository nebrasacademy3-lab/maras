CREATE TABLE "ai_api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "project_label" text,
  "encrypted_key" text NOT NULL,
  "fingerprint" text NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "cooldown_until" text,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_used_at" text,
  "last_success_at" text,
  "last_error_code" text,
  "created_by" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_api_keys_priority_check" CHECK ("priority" BETWEEN 1 AND 10000),
  CONSTRAINT "ai_api_keys_status_check" CHECK ("status" IN ('active', 'disabled', 'error')),
  CONSTRAINT "ai_api_keys_failures_check" CHECK ("consecutive_failures" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_api_keys_fingerprint_unique" ON "ai_api_keys" USING btree ("fingerprint");
--> statement-breakpoint
CREATE INDEX "ai_api_keys_rotation_idx" ON "ai_api_keys" USING btree ("status", "priority", "cooldown_until", "last_used_at");
--> statement-breakpoint

CREATE TABLE "ai_service_settings" (
  "service" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "model" text DEFAULT 'gemini-2.5-flash' NOT NULL,
  "free_monthly_limit" integer DEFAULT 0 NOT NULL,
  "subscriber_monthly_limit" integer DEFAULT 0 NOT NULL,
  "max_output_tokens" integer DEFAULT 4096 NOT NULL,
  "max_file_bytes" integer DEFAULT 20971520 NOT NULL,
  "temperature" real DEFAULT 0.2 NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "updated_by" text,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_service_settings_service_check" CHECK ("service" IN ('chat', 'summary', 'translation', 'quiz')),
  CONSTRAINT "ai_service_settings_free_limit_check" CHECK ("free_monthly_limit" BETWEEN 0 AND 100000),
  CONSTRAINT "ai_service_settings_subscriber_limit_check" CHECK ("subscriber_monthly_limit" BETWEEN 0 AND 100000),
  CONSTRAINT "ai_service_settings_output_check" CHECK ("max_output_tokens" BETWEEN 256 AND 65536),
  CONSTRAINT "ai_service_settings_file_check" CHECK ("max_file_bytes" BETWEEN 262144 AND 52428800),
  CONSTRAINT "ai_service_settings_temperature_check" CHECK ("temperature" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE INDEX "ai_service_settings_enabled_idx" ON "ai_service_settings" USING btree ("enabled");
--> statement-breakpoint

CREATE TABLE "ai_entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "source" text NOT NULL,
  "external_ref" text,
  "status" text DEFAULT 'active' NOT NULL,
  "starts_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "expires_at" text,
  "created_by" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_entitlements_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_entitlements_status_check" CHECK ("status" IN ('active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_entitlements_source_unique" ON "ai_entitlements" USING btree ("user_id", "source", "external_ref");
--> statement-breakpoint
CREATE INDEX "ai_entitlements_user_status_idx" ON "ai_entitlements" USING btree ("user_id", "status", "expires_at");
--> statement-breakpoint

CREATE TABLE "ai_subscription_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_number" text NOT NULL,
  "user_id" integer NOT NULL,
  "customer_email" text NOT NULL,
  "customer_name" text NOT NULL,
  "customer_phone" text,
  "amount" real NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'SAR' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "checkout_key" text NOT NULL,
  "checkout_url" text,
  "tap_charge_id" text,
  "paid_at" text,
  "entitlement_expires_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_subscription_orders_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict,
  CONSTRAINT "ai_subscription_orders_amount_check" CHECK ("amount" > 0 AND "amount_minor" > 0),
  CONSTRAINT "ai_subscription_orders_currency_check" CHECK ("currency" = 'SAR'),
  CONSTRAINT "ai_subscription_orders_status_check" CHECK ("status" IN ('pending', 'initiated', 'in_progress', 'verification_pending', 'paid', 'failed', 'cancelled', 'declined', 'abandoned', 'voided', 'refunded', 'partially_refunded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_subscription_orders_number_unique" ON "ai_subscription_orders" USING btree ("order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_subscription_orders_checkout_unique" ON "ai_subscription_orders" USING btree ("checkout_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_subscription_orders_tap_unique" ON "ai_subscription_orders" USING btree ("tap_charge_id");
--> statement-breakpoint
CREATE INDEX "ai_subscription_orders_user_idx" ON "ai_subscription_orders" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_subscription_orders_status_idx" ON "ai_subscription_orders" USING btree ("status", "updated_at");
--> statement-breakpoint

CREATE TABLE "ai_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "title" text DEFAULT 'محادثة جديدة' NOT NULL,
  "kind" text DEFAULT 'chat' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_conversations_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_conversations_kind_check" CHECK ("kind" IN ('chat', 'summary', 'translation', 'quiz')),
  CONSTRAINT "ai_conversations_status_check" CHECK ("status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "ai_conversations_user_idx" ON "ai_conversations" USING btree ("user_id", "status", "updated_at");
--> statement-breakpoint

CREATE TABLE "ai_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "conversation_id" integer,
  "object_key" text NOT NULL,
  "storage_provider" text DEFAULT 'local' NOT NULL,
  "original_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "scan_status" text DEFAULT 'pending' NOT NULL,
  "scan_provider" text,
  "scanned_at" text,
  "scan_error" text,
  "quarantine_reason" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_files_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_files_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null,
  CONSTRAINT "ai_files_size_check" CHECK ("size_bytes" > 0),
  CONSTRAINT "ai_files_status_check" CHECK ("status" IN ('ready', 'pending_scan', 'quarantined')),
  CONSTRAINT "ai_files_scan_status_check" CHECK ("scan_status" IN ('pending', 'clean', 'quarantined'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_files_object_unique" ON "ai_files" USING btree ("object_key");
--> statement-breakpoint
CREATE INDEX "ai_files_user_idx" ON "ai_files" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_files_conversation_idx" ON "ai_files" USING btree ("conversation_id", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "role" text NOT NULL,
  "service" text DEFAULT 'chat' NOT NULL,
  "content" text NOT NULL,
  "file_id" integer,
  "model" text,
  "usage_json" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_messages_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade,
  CONSTRAINT "ai_messages_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_messages_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_files"("id") ON DELETE set null,
  CONSTRAINT "ai_messages_role_check" CHECK ("role" IN ('user', 'assistant')),
  CONSTRAINT "ai_messages_service_check" CHECK ("service" IN ('chat', 'summary', 'translation', 'quiz'))
);
--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_messages_user_idx" ON "ai_messages" USING btree ("user_id", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_usage_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL,
  "user_id" integer NOT NULL,
  "service" text NOT NULL,
  "key_id" integer,
  "conversation_id" integer,
  "file_id" integer,
  "model" text,
  "status" text NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "error_code" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_usage_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_usage_events_key_fk" FOREIGN KEY ("key_id") REFERENCES "public"."ai_api_keys"("id") ON DELETE set null,
  CONSTRAINT "ai_usage_events_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null,
  CONSTRAINT "ai_usage_events_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_files"("id") ON DELETE set null,
  CONSTRAINT "ai_usage_events_service_check" CHECK ("service" IN ('chat', 'summary', 'translation', 'quiz')),
  CONSTRAINT "ai_usage_events_status_check" CHECK ("status" IN ('processing', 'succeeded', 'failed', 'billable_failed')),
  CONSTRAINT "ai_usage_events_tokens_check" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_events_request_unique" ON "ai_usage_events" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_month_idx" ON "ai_usage_events" USING btree ("user_id", "service", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_usage_events_key_idx" ON "ai_usage_events" USING btree ("key_id", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_artifacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "conversation_id" integer,
  "file_id" integer NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "metadata_json" text,
  "model" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_artifacts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_artifacts_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null,
  CONSTRAINT "ai_artifacts_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_files"("id") ON DELETE cascade,
  CONSTRAINT "ai_artifacts_kind_check" CHECK ("kind" IN ('summary', 'translation'))
);
--> statement-breakpoint
CREATE INDEX "ai_artifacts_user_idx" ON "ai_artifacts" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_artifacts_file_idx" ON "ai_artifacts" USING btree ("file_id", "kind", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_quizzes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "conversation_id" integer,
  "file_id" integer NOT NULL,
  "title" text NOT NULL,
  "language" text DEFAULT 'ar' NOT NULL,
  "questions_json" text NOT NULL,
  "model" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_quizzes_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_quizzes_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null,
  CONSTRAINT "ai_quizzes_file_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_files"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "ai_quizzes_user_idx" ON "ai_quizzes" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "ai_quizzes_file_idx" ON "ai_quizzes" USING btree ("file_id", "created_at");
--> statement-breakpoint

CREATE TABLE "ai_quiz_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "quiz_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "answers_json" text NOT NULL,
  "score" integer NOT NULL,
  "total" integer NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "ai_quiz_attempts_quiz_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."ai_quizzes"("id") ON DELETE cascade,
  CONSTRAINT "ai_quiz_attempts_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "ai_quiz_attempts_score_check" CHECK ("total" > 0 AND "score" BETWEEN 0 AND "total")
);
--> statement-breakpoint
CREATE INDEX "ai_quiz_attempts_quiz_idx" ON "ai_quiz_attempts" USING btree ("quiz_id", "user_id", "created_at");
--> statement-breakpoint
