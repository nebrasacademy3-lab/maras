CREATE TABLE "email_verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"sent_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_exchanges" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"challenge" text NOT NULL,
	"return_to" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"state_hash" text NOT NULL,
	"provider" text NOT NULL,
	"referral_code" text,
	"binding_hash" text,
	"nonce" text NOT NULL,
	"verifier" text NOT NULL,
	"return_to" text DEFAULT '/dashboard' NOT NULL,
	"mobile_challenge" text,
	"mobile_redirect_uri" text,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_exchanges" ADD CONSTRAINT "oauth_exchanges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_user_purpose_created_idx" ON "email_verification_codes" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_exchange_hash_unique" ON "oauth_exchanges" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "oauth_exchange_expiry_idx" ON "oauth_exchanges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_identity_provider_subject_unique" ON "oauth_identities" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "oauth_identity_user_idx" ON "oauth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_state_hash_unique" ON "oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_state_expiry_idx" ON "oauth_states" USING btree ("expires_at");