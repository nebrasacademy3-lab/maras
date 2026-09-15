CREATE TABLE "account_mfa_challenges" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_id" text NOT NULL,
	"remember" boolean DEFAULT true NOT NULL,
	"expires_at" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_mfa_recovery_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" text,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_permissions" (
	"user_id" integer NOT NULL,
	"permission" text NOT NULL,
	"granted_by" integer NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "staff_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "mfa_verified_at" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_platform_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_mfa_challenges" ADD CONSTRAINT "account_mfa_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_mfa_recovery_codes" ADD CONSTRAINT "account_mfa_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_mfa_challenges_user_idx" ON "account_mfa_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_mfa_challenges_expiry_idx" ON "account_mfa_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_mfa_recovery_unique" ON "account_mfa_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_owner_unique" ON "users" USING btree ("is_platform_owner") WHERE "users"."is_platform_owner" = true;--> statement-breakpoint
-- Establish one owner from the first active legacy admin; fresh installations use bootstrap-admin.
UPDATE users SET is_platform_owner = true WHERE id = (SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1);
--> statement-breakpoint
INSERT INTO audit_logs(actor_email, action, entity_type, entity_id, after_json)
SELECT 'schema-migration', 'owner.established', 'user', id::text, '{"policy":"first-active-admin","version":1}' FROM users WHERE is_platform_owner;
--> statement-breakpoint
UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP::text WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE role = 'admin' AND NOT is_platform_owner);
--> statement-breakpoint
UPDATE users SET role = 'supervisor', updated_at = CURRENT_TIMESTAMP::text WHERE role = 'admin' AND NOT is_platform_owner;
--> statement-breakpoint
UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP::text WHERE revoked_at IS NULL AND user_id IN (SELECT user_id FROM admin_mfa_factors WHERE type = 'totp' AND verified_at IS NOT NULL AND disabled_at IS NULL);
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_owner_role_check CHECK ((is_platform_owner AND role = 'admin' AND status = 'active') OR (NOT is_platform_owner AND role <> 'admin'));
--> statement-breakpoint
CREATE FUNCTION protect_platform_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_platform_owner THEN RAISE EXCEPTION 'The platform owner cannot be deleted' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_platform_owner AND (NEW.id <> OLD.id OR NOT NEW.is_platform_owner OR NEW.role <> 'admin' OR NEW.status <> 'active') THEN
    RAISE EXCEPTION 'The platform owner identity and role are protected' USING ERRCODE = '23514';
  END IF;
  IF NOT OLD.is_platform_owner AND NEW.is_platform_owner THEN
    RAISE EXCEPTION 'Owner transfer requires an audited offline migration' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_platform_owner_before_change BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_platform_owner();
--> statement-breakpoint
ALTER TABLE staff_permissions ADD CONSTRAINT staff_permissions_no_owner_privileges CHECK (permission NOT IN ('staff.manage', 'audit.view', '*'));
