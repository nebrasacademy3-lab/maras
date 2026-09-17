CREATE TABLE "email_change_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "current_email" text NOT NULL,
  "new_email" text NOT NULL,
  "challenge_nonce" text NOT NULL,
  "current_code_hash" text NOT NULL,
  "new_code_hash" text NOT NULL,
  "current_attempts" integer DEFAULT 0 NOT NULL,
  "new_attempts" integer DEFAULT 0 NOT NULL,
  "current_sent_at" text,
  "new_sent_at" text,
  "current_verified_at" text,
  "new_verified_at" text,
  "expires_at" text NOT NULL,
  "used_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "email_change_current_attempts_check" CHECK ("current_attempts" BETWEEN 0 AND 5),
  CONSTRAINT "email_change_new_attempts_check" CHECK ("new_attempts" BETWEEN 0 AND 5),
  CONSTRAINT "email_change_requests_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "email_change_user_created_idx" ON "email_change_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "email_change_user_used_idx" ON "email_change_requests" USING btree ("user_id","used_at");
