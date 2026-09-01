ALTER TABLE "coupons" ADD COLUMN "owner_user_id" integer;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "source_type" text DEFAULT 'campaign' NOT NULL;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "source_key" text;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "title" text;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "assigned_by" text;
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL;
--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_source_key_unique" ON "coupons" USING btree ("source_key");
--> statement-breakpoint
CREATE INDEX "coupons_owner_idx" ON "coupons" USING btree ("owner_user_id", "status");
--> statement-breakpoint

CREATE TABLE "referral_program_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "program_key" text DEFAULT 'default' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "qualification_event" text DEFAULT 'first_paid_order' NOT NULL,
  "title" text DEFAULT 'شارك مراس واكسب هداياك' NOT NULL,
  "description" text DEFAULT 'شارك رابطك الخاص، وكل تسجيل مؤهل يقربك من مكافأة جديدة.' NOT NULL,
  "terms" text DEFAULT 'تُحتسب الحسابات الجديدة الحقيقية فقط، وتخضع الحالات المتكررة أو غير الطبيعية للمراجعة.' NOT NULL,
  "max_qualified_per_ip_per_day" integer DEFAULT 3 NOT NULL,
  "default_coupon_validity_days" integer DEFAULT 90 NOT NULL,
  "updated_by" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "referral_program_qualification_check" CHECK ("qualification_event" IN ('registration', 'first_paid_order')),
  CONSTRAINT "referral_program_ip_limit_check" CHECK ("max_qualified_per_ip_per_day" BETWEEN 1 AND 100),
  CONSTRAINT "referral_program_validity_check" CHECK ("default_coupon_validity_days" BETWEEN 1 AND 730)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referral_program_key_unique" ON "referral_program_settings" USING btree ("program_key");
--> statement-breakpoint

CREATE TABLE "referral_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "code" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "share_count" integer DEFAULT 0 NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "referral_codes_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "referral_codes_status_check" CHECK ("status" IN ('active', 'paused', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_user_unique" ON "referral_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_unique" ON "referral_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "referral_codes_status_idx" ON "referral_codes" USING btree ("status");
--> statement-breakpoint

CREATE TABLE "referral_tiers" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "required_referrals" integer NOT NULL,
  "reward_type" text DEFAULT 'coupon_percent' NOT NULL,
  "reward_value" real DEFAULT 0 NOT NULL,
  "reward_duration_days" integer,
  "coupon_validity_days" integer,
  "course_slug" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "referral_tiers_required_check" CHECK ("required_referrals" BETWEEN 1 AND 100000),
  CONSTRAINT "referral_tiers_type_check" CHECK ("reward_type" IN ('coupon_percent', 'coupon_fixed', 'ai_subscription')),
  CONSTRAINT "referral_tiers_value_check" CHECK ("reward_value" > 0),
  CONSTRAINT "referral_tiers_percent_check" CHECK ("reward_type" <> 'coupon_percent' OR "reward_value" <= 95),
  CONSTRAINT "referral_tiers_duration_check" CHECK ("reward_duration_days" IS NULL OR "reward_duration_days" BETWEEN 1 AND 730),
  CONSTRAINT "referral_tiers_coupon_validity_check" CHECK ("coupon_validity_days" IS NULL OR "coupon_validity_days" BETWEEN 1 AND 730)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referral_tiers_requirement_unique" ON "referral_tiers" USING btree ("required_referrals");
--> statement-breakpoint
CREATE INDEX "referral_tiers_enabled_idx" ON "referral_tiers" USING btree ("enabled", "sort_order");
--> statement-breakpoint

CREATE TABLE "referral_attributions" (
  "id" serial PRIMARY KEY NOT NULL,
  "referral_code_id" integer NOT NULL,
  "referrer_user_id" integer NOT NULL,
  "referred_user_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "qualification_event" text DEFAULT 'first_paid_order' NOT NULL,
  "ip_hash" text,
  "device_hash" text,
  "review_reason" text,
  "qualified_at" text,
  "reviewed_at" text,
  "reviewed_by" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "referral_attributions_code_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE cascade,
  CONSTRAINT "referral_attributions_referrer_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "referral_attributions_referred_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "referral_attributions_status_check" CHECK ("status" IN ('pending', 'qualified', 'rejected')),
  CONSTRAINT "referral_attributions_not_self_check" CHECK ("referrer_user_id" <> "referred_user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "referral_attributions_referred_unique" ON "referral_attributions" USING btree ("referred_user_id");
--> statement-breakpoint
CREATE INDEX "referral_attributions_referrer_idx" ON "referral_attributions" USING btree ("referrer_user_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX "referral_attributions_ip_idx" ON "referral_attributions" USING btree ("referrer_user_id", "ip_hash", "created_at");
--> statement-breakpoint

CREATE TABLE "user_rewards" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "referral_tier_id" integer,
  "coupon_id" integer,
  "source_type" text DEFAULT 'referral_tier' NOT NULL,
  "source_key" text NOT NULL,
  "reward_type" text NOT NULL,
  "reward_value" real DEFAULT 0 NOT NULL,
  "benefit_payload_json" text DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "granted_by" text,
  "note" text,
  "issued_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "expires_at" text,
  "redeemed_at" text,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "user_rewards_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "user_rewards_tier_fk" FOREIGN KEY ("referral_tier_id") REFERENCES "public"."referral_tiers"("id") ON DELETE set null,
  CONSTRAINT "user_rewards_coupon_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null,
  CONSTRAINT "user_rewards_type_check" CHECK ("reward_type" IN ('coupon_percent', 'coupon_fixed', 'ai_subscription')),
  CONSTRAINT "user_rewards_status_check" CHECK ("status" IN ('active', 'disabled', 'redeemed', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_rewards_source_unique" ON "user_rewards" USING btree ("source_key");
--> statement-breakpoint
CREATE INDEX "user_rewards_user_idx" ON "user_rewards" USING btree ("user_id", "status", "issued_at");
--> statement-breakpoint
CREATE INDEX "user_rewards_type_idx" ON "user_rewards" USING btree ("reward_type", "status", "expires_at");
--> statement-breakpoint

CREATE TABLE "coupon_uses" (
  "id" serial PRIMARY KEY NOT NULL,
  "coupon_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "order_number" text NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL,
  "reserved_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  "reservation_expires_at" text NOT NULL,
  "redeemed_at" text,
  "released_at" text,
  CONSTRAINT "coupon_uses_coupon_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade,
  CONSTRAINT "coupon_uses_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "coupon_uses_status_check" CHECK ("status" IN ('reserved', 'redeemed', 'released'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_uses_order_unique" ON "coupon_uses" USING btree ("order_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_uses_active_user_unique" ON "coupon_uses" USING btree ("coupon_id", "user_id") WHERE "status" IN ('reserved', 'redeemed');
--> statement-breakpoint
CREATE INDEX "coupon_uses_coupon_status_idx" ON "coupon_uses" USING btree ("coupon_id", "status");
--> statement-breakpoint
CREATE INDEX "coupon_uses_user_idx" ON "coupon_uses" USING btree ("user_id", "status");
--> statement-breakpoint

INSERT INTO "referral_program_settings" ("program_key") VALUES ('default') ON CONFLICT ("program_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "referral_tiers" ("name", "description", "required_referrals", "reward_type", "reward_value", "coupon_validity_days", "sort_order")
VALUES
  ('هدية البداية', 'عند اكتمال 5 إحالات مؤهلة تحصل على كوبون خصم 25٪ خاص بحسابك.', 5, 'coupon_percent', 25, 90, 10),
  ('هدية الإنجاز', 'عند اكتمال 10 إحالات مؤهلة تحصل على كوبون خصم 50٪ خاص بحسابك.', 10, 'coupon_percent', 50, 90, 20)
ON CONFLICT ("required_referrals") DO NOTHING;
--> statement-breakpoint
INSERT INTO "referral_codes" ("user_id", "code", "status")
SELECT "id", 'MRS-' || UPPER(SUBSTRING(MD5('meras-referral:' || "id"::text) FROM 1 FOR 12)), 'active'
FROM "users"
WHERE "role" = 'student'
ON CONFLICT ("user_id") DO NOTHING;
