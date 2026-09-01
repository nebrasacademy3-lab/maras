ALTER TABLE "course_request_files" ADD COLUMN "scan_status" text DEFAULT 'clean' NOT NULL;
--> statement-breakpoint
ALTER TABLE "course_request_files" ADD COLUMN "scan_provider" text;
--> statement-breakpoint
ALTER TABLE "course_request_files" ADD COLUMN "scanned_at" text;
--> statement-breakpoint
ALTER TABLE "course_request_files" ADD COLUMN "scan_error" text;
--> statement-breakpoint
ALTER TABLE "course_request_files" ADD COLUMN "quarantine_reason" text;
--> statement-breakpoint
ALTER TABLE "course_request_files" ALTER COLUMN "scan_status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "scan_status" text DEFAULT 'clean' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "scan_provider" text;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "scanned_at" text;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "scan_error" text;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ADD COLUMN "quarantine_reason" text;
--> statement-breakpoint
ALTER TABLE "support_reply_files" ALTER COLUMN "scan_status" SET DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "tags_json" text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "first_response_at" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "resolved_at" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "satisfaction_rating" integer;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "satisfaction_comment" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bundle_slug" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_amount_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_fee_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "settled_net_minor" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "settlement_status" text DEFAULT 'unreconciled' NOT NULL;
--> statement-breakpoint
UPDATE "orders" SET "subtotal_minor" = ROUND("subtotal" * 100)::integer, "discount_minor" = ROUND("discount" * 100)::integer, "total_minor" = ROUND("total" * 100)::integer WHERE "total_minor" IS NULL;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "object_type" text;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "event_type" text;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "amount_minor" integer;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "currency" text;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "signature_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "processed_at" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "status" text DEFAULT 'issued' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "subtotal_minor" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "discount_minor" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_amount_minor" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "total_minor" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "snapshot_json" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_at" text;
--> statement-breakpoint
UPDATE "invoices" SET "total_minor" = ROUND("total" * 100)::integer, "tax_amount_minor" = ROUND("tax_amount" * 100)::integer WHERE "total_minor" IS NULL;
--> statement-breakpoint
CREATE TABLE "course_waitlist" ("id" serial PRIMARY KEY NOT NULL,"user_email" text NOT NULL,"course_slug" text NOT NULL,"source" text DEFAULT 'course_page' NOT NULL,"status" text DEFAULT 'active' NOT NULL,"notified_at" text,"converted_at" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_waitlist_user_course_unique" ON "course_waitlist" USING btree ("user_email","course_slug");
--> statement-breakpoint
CREATE INDEX "course_waitlist_course_status_idx" ON "course_waitlist" USING btree ("course_slug","status");
--> statement-breakpoint
CREATE TABLE "course_bundles" ("id" serial PRIMARY KEY NOT NULL,"slug" text NOT NULL,"title" text NOT NULL,"description" text DEFAULT '' NOT NULL,"institution_slug" text,"specialty_slug" text,"discount_type" text DEFAULT 'percent' NOT NULL,"discount_value" real DEFAULT 0 NOT NULL,"status" text DEFAULT 'draft' NOT NULL,"featured" boolean DEFAULT false NOT NULL,"starts_at" text,"expires_at" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_bundles_slug_unique" ON "course_bundles" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "course_bundles_status_idx" ON "course_bundles" USING btree ("status","starts_at","expires_at");
--> statement-breakpoint
CREATE TABLE "course_bundle_items" ("id" serial PRIMARY KEY NOT NULL,"bundle_id" integer NOT NULL,"course_slug" text NOT NULL,"position" integer DEFAULT 0 NOT NULL,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,CONSTRAINT "course_bundle_items_bundle_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."course_bundles"("id") ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX "course_bundle_items_unique" ON "course_bundle_items" USING btree ("bundle_id","course_slug");
--> statement-breakpoint
CREATE INDEX "course_bundle_items_bundle_idx" ON "course_bundle_items" USING btree ("bundle_id","position");
--> statement-breakpoint
CREATE TABLE "refund_requests" ("id" serial PRIMARY KEY NOT NULL,"request_number" text NOT NULL,"order_number" text NOT NULL,"requested_by_email" text NOT NULL,"amount_minor" integer NOT NULL,"currency" text DEFAULT 'SAR' NOT NULL,"reason" text NOT NULL,"status" text DEFAULT 'pending' NOT NULL,"reviewed_by" text,"review_note" text,"provider_refund_id" text,"approved_at" text,"completed_at" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_number_unique" ON "refund_requests" USING btree ("request_number");
--> statement-breakpoint
CREATE INDEX "refund_requests_order_idx" ON "refund_requests" USING btree ("order_number");
--> statement-breakpoint
CREATE INDEX "refund_requests_status_idx" ON "refund_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TABLE "admin_approvals" ("id" serial PRIMARY KEY NOT NULL,"entity_type" text NOT NULL,"entity_id" text NOT NULL,"action" text NOT NULL,"approver_email" text NOT NULL,"decision" text NOT NULL,"note" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_approvals_unique" ON "admin_approvals" USING btree ("entity_type","entity_id","action","approver_email");
--> statement-breakpoint
CREATE INDEX "admin_approvals_entity_idx" ON "admin_approvals" USING btree ("entity_type","entity_id");
--> statement-breakpoint
CREATE TABLE "credit_notes" ("id" serial PRIMARY KEY NOT NULL,"credit_note_number" text NOT NULL,"invoice_number" text NOT NULL,"order_number" text NOT NULL,"refund_request_number" text,"amount_minor" integer NOT NULL,"tax_amount_minor" integer DEFAULT 0 NOT NULL,"currency" text DEFAULT 'SAR' NOT NULL,"reason" text NOT NULL,"snapshot_json" text,"pdf_object_key" text,"issued_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_unique" ON "credit_notes" USING btree ("credit_note_number");
--> statement-breakpoint
CREATE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("order_number");
--> statement-breakpoint
CREATE TABLE "payment_settlements" ("id" serial PRIMARY KEY NOT NULL,"provider" text DEFAULT 'tap' NOT NULL,"provider_settlement_id" text NOT NULL,"period_start" text,"period_end" text,"currency" text DEFAULT 'SAR' NOT NULL,"gross_minor" integer DEFAULT 0 NOT NULL,"refund_minor" integer DEFAULT 0 NOT NULL,"fee_minor" integer DEFAULT 0 NOT NULL,"tax_minor" integer DEFAULT 0 NOT NULL,"net_minor" integer DEFAULT 0 NOT NULL,"status" text DEFAULT 'imported' NOT NULL,"imported_by" text,"reconciled_at" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlements_provider_unique" ON "payment_settlements" USING btree ("provider","provider_settlement_id");
--> statement-breakpoint
CREATE INDEX "payment_settlements_status_idx" ON "payment_settlements" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TABLE "payment_settlement_lines" ("id" serial PRIMARY KEY NOT NULL,"settlement_id" integer NOT NULL,"order_number" text,"provider_transaction_id" text NOT NULL,"gross_minor" integer DEFAULT 0 NOT NULL,"fee_minor" integer DEFAULT 0 NOT NULL,"tax_minor" integer DEFAULT 0 NOT NULL,"net_minor" integer DEFAULT 0 NOT NULL,"status" text DEFAULT 'unmatched' NOT NULL,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,CONSTRAINT "payment_settlement_lines_settlement_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."payment_settlements"("id") ON DELETE cascade);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_settlement_lines_provider_unique" ON "payment_settlement_lines" USING btree ("settlement_id","provider_transaction_id");
--> statement-breakpoint
CREATE INDEX "payment_settlement_lines_order_idx" ON "payment_settlement_lines" USING btree ("order_number");
--> statement-breakpoint
CREATE TABLE "admin_mfa_factors" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"type" text DEFAULT 'totp' NOT NULL,"label" text DEFAULT 'Authenticator' NOT NULL,"secret_encrypted" text,"credential_id" text,"public_key_json" text,"counter" integer DEFAULT 0 NOT NULL,"verified_at" text,"disabled_at" text,"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mfa_factors_credential_unique" ON "admin_mfa_factors" USING btree ("credential_id");
--> statement-breakpoint
CREATE INDEX "admin_mfa_factors_user_idx" ON "admin_mfa_factors" USING btree ("user_id","disabled_at");
