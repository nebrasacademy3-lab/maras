ALTER TABLE "auth_devices" ADD COLUMN "return_policy" text DEFAULT 'blocked' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_devices" ADD COLUMN "blocked_until" text;--> statement-breakpoint
ALTER TABLE "auth_devices" ADD COLUMN "policy_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_devices" ADD CONSTRAINT "auth_devices_return_policy_check" CHECK ("auth_devices"."return_policy" IN ('blocked', 'allowed', 'approval'));--> statement-breakpoint
ALTER TABLE "auth_devices" ADD CONSTRAINT "auth_devices_policy_version_check" CHECK ("auth_devices"."policy_version" >= 0);--> statement-breakpoint
ALTER TABLE "auth_devices" ADD CONSTRAINT "auth_devices_block_expiry_policy_check" CHECK ("auth_devices"."blocked_until" IS NULL OR "auth_devices"."return_policy" = 'allowed');