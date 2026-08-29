ALTER TABLE "catalog_courses" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "catalog_courses" ADD COLUMN "verified_at" text;--> statement-breakpoint
ALTER TABLE "catalog_institutions" ADD COLUMN "directory_source_url" text;--> statement-breakpoint
ALTER TABLE "catalog_institutions" ADD COLUMN "verification_status" text DEFAULT 'pending-review' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_institutions" ADD COLUMN "aliases_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_specialties" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "catalog_specialties" ADD COLUMN "verified_at" text;--> statement-breakpoint
ALTER TABLE "catalog_specialties" ADD COLUMN "verification_status" text DEFAULT 'pending-review' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_specialties" ADD COLUMN "faculty" text;--> statement-breakpoint
ALTER TABLE "catalog_specialties" ADD COLUMN "degree" text;