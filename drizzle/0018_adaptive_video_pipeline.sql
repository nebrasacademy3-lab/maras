ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "storage_provider" text NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "processing_status" text NOT NULL DEFAULT 'queued';
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "processing_progress" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "processing_error" text;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "source_width" integer;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "source_height" integer;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "hls_master_object_key" text;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "thumbnail_object_key" text;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "derivatives_prefix" text;
--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "processed_at" text;
--> statement-breakpoint
UPDATE "video_assets"
SET "processing_status" = CASE WHEN "status" = 'ready' THEN 'source_only' ELSE 'queued' END,
    "processing_progress" = CASE WHEN "status" = 'ready' THEN 100 ELSE 0 END
WHERE "hls_master_object_key" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_processing_status_idx" ON "video_assets" USING btree ("processing_status","updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_renditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"quality_label" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bitrate_kbps" integer NOT NULL,
	"codec" text NOT NULL DEFAULT 'h264',
	"audio_codec" text NOT NULL DEFAULT 'aac',
	"manifest_object_key" text NOT NULL,
	"segment_prefix" text NOT NULL,
	"status" text NOT NULL DEFAULT 'processing',
	"size_bytes" integer NOT NULL DEFAULT 0,
	"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
	"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
	CONSTRAINT "video_renditions_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_renditions_asset_quality_unique" ON "video_renditions" USING btree ("asset_id","quality_label");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_renditions_asset_status_idx" ON "video_renditions" USING btree ("asset_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_processing_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'queued',
	"attempts" integer NOT NULL DEFAULT 0,
	"max_attempts" integer NOT NULL DEFAULT 5,
	"next_attempt_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
	"locked_at" text,
	"locked_by" text,
	"last_error" text,
	"completed_at" text,
	"created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
	"updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
	CONSTRAINT "video_processing_jobs_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_processing_jobs_asset_unique" ON "video_processing_jobs" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_processing_jobs_claim_idx" ON "video_processing_jobs" USING btree ("status","next_attempt_at","locked_at");
