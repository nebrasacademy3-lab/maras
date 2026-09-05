CREATE TABLE "course_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"student_visible" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"scan_status" text DEFAULT 'pending' NOT NULL,
	"scan_provider" text,
	"scanned_at" text,
	"scan_error" text,
	"quarantine_reason" text,
	"created_by" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'partner' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo_object_key" text,
	"logo_url" text,
	"logo_content_type" text,
	"destination_url" text,
	"credential_number" text,
	"verification_url" text,
	"rights_confirmed" boolean DEFAULT false NOT NULL,
	"rights_reference" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_courses" ADD COLUMN "audience_scope" text DEFAULT 'specialty' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_resources" ADD CONSTRAINT "course_resources_course_slug_catalog_courses_slug_fk" FOREIGN KEY ("course_slug") REFERENCES "public"."catalog_courses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_resources_object_unique" ON "course_resources" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "course_resources_course_idx" ON "course_resources" USING btree ("course_slug","status","student_visible","sort_order");--> statement-breakpoint
CREATE INDEX "course_resources_scan_idx" ON "course_resources" USING btree ("scan_status","status");--> statement-breakpoint
CREATE INDEX "platform_partners_status_order_idx" ON "platform_partners" USING btree ("status","sort_order");--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_course_resources_admin ON course_resources;--> statement-breakpoint
CREATE TRIGGER sync_course_resources_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_resources FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_platform_partners_admin ON platform_partners;--> statement-breakpoint
CREATE TRIGGER sync_platform_partners_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON platform_partners FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();--> statement-breakpoint
SELECT meras_touch_sync('admin', '*');
