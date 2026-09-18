ALTER TABLE "ai_usage_events" ADD COLUMN "provider_tier" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_tier_check" CHECK ("ai_usage_events"."provider_tier" IN ('free', 'paid'));
