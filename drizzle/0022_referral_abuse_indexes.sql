CREATE INDEX IF NOT EXISTS "referral_attributions_device_status_idx"
  ON "referral_attributions" USING btree ("device_hash", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_attributions_ip_created_status_idx"
  ON "referral_attributions" USING btree ("ip_hash", "created_at", "status");
