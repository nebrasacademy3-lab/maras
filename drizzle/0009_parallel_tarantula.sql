ALTER TABLE "catalog_courses" ADD COLUMN "cover_image_url" text;--> statement-breakpoint
ALTER TABLE "course_units" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "description" text DEFAULT '' NOT NULL;