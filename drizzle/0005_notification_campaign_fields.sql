ALTER TABLE "notifications" ADD COLUMN "action_label" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "presentation" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "push_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "starts_at" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "expires_at" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dismissible" boolean DEFAULT true NOT NULL;