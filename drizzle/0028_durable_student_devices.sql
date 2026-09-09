CREATE TABLE "auth_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_id" text NOT NULL,
	"device_label" text NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"first_seen_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"last_seen_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"revoked_at" text,
	"revoked_by" text,
	"revocation_reason" text
);
--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "auth_devices" ADD CONSTRAINT "auth_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_devices_user_device_unique" ON "auth_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "auth_devices_user_active_idx" ON "auth_devices" USING btree ("user_id","revoked_at");
--> statement-breakpoint
-- Recover the earliest two distinct credible installation/browser identities
-- from retained history, including logged-out and expired sessions. User-agent
-- fallback hashes cannot distinguish machines and are deliberately excluded.
WITH first_sessions AS (
  SELECT DISTINCT ON (s.user_id, s.device_id)
    s.user_id, s.device_id, COALESCE(s.device_label, 'جهاز مسجل سابقًا') AS device_label,
    s.platform, s.created_at, s.id,
    max(s.last_seen_at::timestamptz) OVER (PARTITION BY s.user_id, s.device_id)::text AS last_seen_at
  FROM auth_sessions s INNER JOIN users u ON u.id = s.user_id
  WHERE u.role = 'student' AND s.device_id IS NOT NULL
    AND length(s.device_id) >= 12 AND s.device_id NOT LIKE 'fallback-%'
  ORDER BY s.user_id, s.device_id, s.created_at::timestamptz, s.id
), ranked AS (
  SELECT *, row_number() OVER (PARTITION BY user_id ORDER BY created_at::timestamptz, id) AS position
  FROM first_sessions
)
INSERT INTO auth_devices (user_id, device_id, device_label, platform, first_seen_at, last_seen_at)
SELECT user_id, device_id, device_label, platform, created_at, last_seen_at FROM ranked WHERE position <= 2
ON CONFLICT (user_id, device_id) DO NOTHING;
--> statement-breakpoint
-- Previously active third devices must not survive the policy change.
UPDATE auth_sessions s SET revoked_at = CURRENT_TIMESTAMP::text
FROM users u WHERE u.id = s.user_id AND u.role = 'student' AND s.revoked_at IS NULL
AND NOT EXISTS (SELECT 1 FROM auth_devices d WHERE d.user_id = s.user_id AND d.device_id = s.device_id AND d.revoked_at IS NULL);
--> statement-breakpoint
UPDATE push_devices p SET status = 'revoked', last_seen_at = CURRENT_TIMESTAMP::text
FROM users u WHERE u.id = p.user_id AND u.role = 'student' AND p.status = 'active'
AND NOT EXISTS (SELECT 1 FROM auth_devices d WHERE d.user_id = p.user_id AND d.device_id = p.device_id AND d.revoked_at IS NULL);
--> statement-breakpoint
UPDATE platform_settings SET value = '2' WHERE key = 'max_student_devices';
