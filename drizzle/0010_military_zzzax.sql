CREATE TABLE "sync_revisions" (
	"channel" text NOT NULL,
	"scope_key" text DEFAULT '*' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "sync_revisions_pk" PRIMARY KEY("channel","scope_key")
);
--> statement-breakpoint
CREATE INDEX "sync_revisions_channel_idx" ON "sync_revisions" USING btree ("channel","updated_at");
--> statement-breakpoint
INSERT INTO "sync_revisions" ("channel", "scope_key", "version") VALUES
	('catalog', '*', 1),
	('account', '*', 1),
	('commerce', '*', 1),
	('support', '*', 1),
	('notifications', '*', 1),
	('requests', '*', 1),
	('supervisor', '*', 1),
	('admin', '*', 1),
	('settings', '*', 1),
	('announcements', '*', 1)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_touch_sync(p_channel text, p_scope text DEFAULT '*')
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	next_scope text := COALESCE(NULLIF(p_scope, ''), '*');
BEGIN
	INSERT INTO sync_revisions (channel, scope_key, version, updated_at)
	VALUES (p_channel, next_scope, 1, CURRENT_TIMESTAMP::text)
	ON CONFLICT (channel, scope_key) DO UPDATE SET
		version = CASE WHEN sync_revisions.version >= 2147483000 THEN 1 ELSE sync_revisions.version + 1 END,
		updated_at = CURRENT_TIMESTAMP::text;
	PERFORM pg_notify('meras_sync', json_build_object('channel', p_channel)::text);
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_catalog_statement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM meras_touch_sync('catalog', '*');
	PERFORM meras_touch_sync('admin', '*');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_settings_statement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM meras_touch_sync('settings', '*');
	PERFORM meras_touch_sync('announcements', '*');
	PERFORM meras_touch_sync('admin', '*');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_admin_statement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM meras_touch_sync('admin', '*');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_supervisor_statement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM meras_touch_sync('supervisor', '*');
	PERFORM meras_touch_sync('admin', '*');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_account_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	new_row jsonb := COALESCE(to_jsonb(NEW), '{}'::jsonb);
	old_row jsonb := COALESCE(to_jsonb(OLD), '{}'::jsonb);
	new_email text := COALESCE(new_row->>'user_email', new_row->>'email');
	old_email text := COALESCE(old_row->>'user_email', old_row->>'email');
	new_user_id text := COALESCE(new_row->>'user_id', new_row->>'id');
	old_user_id text := COALESCE(old_row->>'user_id', old_row->>'id');
BEGIN
	IF new_email IS NOT NULL THEN PERFORM meras_touch_sync('account', 'email:' || lower(new_email)); END IF;
	IF old_email IS NOT NULL AND old_email IS DISTINCT FROM new_email THEN PERFORM meras_touch_sync('account', 'email:' || lower(old_email)); END IF;
	IF new_user_id IS NOT NULL THEN PERFORM meras_touch_sync('account', 'user:' || new_user_id); END IF;
	IF old_user_id IS NOT NULL AND old_user_id IS DISTINCT FROM new_user_id THEN PERFORM meras_touch_sync('account', 'user:' || old_user_id); END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_commerce_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	new_row jsonb := COALESCE(to_jsonb(NEW), '{}'::jsonb);
	old_row jsonb := COALESCE(to_jsonb(OLD), '{}'::jsonb);
	new_email text := COALESCE(new_row->>'customer_email', new_row->>'user_email');
	old_email text := COALESCE(old_row->>'customer_email', old_row->>'user_email');
BEGIN
	IF new_email IS NOT NULL THEN PERFORM meras_touch_sync('commerce', 'email:' || lower(new_email)); END IF;
	IF old_email IS NOT NULL AND old_email IS DISTINCT FROM new_email THEN PERFORM meras_touch_sync('commerce', 'email:' || lower(old_email)); END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_request_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	new_row jsonb := COALESCE(to_jsonb(NEW), '{}'::jsonb);
	old_row jsonb := COALESCE(to_jsonb(OLD), '{}'::jsonb);
	new_user_id text := new_row->>'user_id';
	old_user_id text := old_row->>'user_id';
BEGIN
	IF new_user_id IS NOT NULL THEN PERFORM meras_touch_sync('requests', 'user:' || new_user_id); END IF;
	IF old_user_id IS NOT NULL AND old_user_id IS DISTINCT FROM new_user_id THEN PERFORM meras_touch_sync('requests', 'user:' || old_user_id); END IF;
	PERFORM meras_touch_sync('supervisor', '*');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_support_ticket_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	new_row jsonb := COALESCE(to_jsonb(NEW), '{}'::jsonb);
	old_row jsonb := COALESCE(to_jsonb(OLD), '{}'::jsonb);
	new_email text := new_row->>'user_email';
	old_email text := old_row->>'user_email';
BEGIN
	IF new_email IS NOT NULL THEN PERFORM meras_touch_sync('support', 'email:' || lower(new_email)); END IF;
	IF old_email IS NOT NULL AND old_email IS DISTINCT FROM new_email THEN PERFORM meras_touch_sync('support', 'email:' || lower(old_email)); END IF;
	PERFORM meras_touch_sync('support', 'role:supervisor');
	PERFORM meras_touch_sync('support', 'role:admin');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_support_child_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	row_data jsonb := COALESCE(to_jsonb(NEW), to_jsonb(OLD), '{}'::jsonb);
	ticket_key integer := NULLIF(row_data->>'ticket_id', '')::integer;
	owner_email text;
BEGIN
	IF ticket_key IS NOT NULL THEN SELECT user_email INTO owner_email FROM support_tickets WHERE id = ticket_key; END IF;
	IF owner_email IS NOT NULL THEN PERFORM meras_touch_sync('support', 'email:' || lower(owner_email)); END IF;
	PERFORM meras_touch_sync('support', 'role:supervisor');
	PERFORM meras_touch_sync('support', 'role:admin');
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_notification_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	new_row jsonb := COALESCE(to_jsonb(NEW), '{}'::jsonb);
	old_row jsonb := COALESCE(to_jsonb(OLD), '{}'::jsonb);
	new_email text := new_row->>'user_email';
	old_email text := old_row->>'user_email';
	new_audience text := new_row->>'audience';
	old_audience text := old_row->>'audience';
BEGIN
	IF new_email IS NOT NULL THEN PERFORM meras_touch_sync('notifications', 'email:' || lower(new_email)); END IF;
	IF old_email IS NOT NULL AND old_email IS DISTINCT FROM new_email THEN PERFORM meras_touch_sync('notifications', 'email:' || lower(old_email)); END IF;
	IF new_email IS NULL AND new_audience IS NOT NULL THEN PERFORM meras_touch_sync('notifications', 'role:' || lower(new_audience)); END IF;
	IF old_email IS NULL AND old_audience IS NOT NULL AND old_audience IS DISTINCT FROM new_audience THEN PERFORM meras_touch_sync('notifications', 'role:' || lower(old_audience)); END IF;
	IF new_audience = 'public' OR old_audience = 'public' THEN PERFORM meras_touch_sync('announcements', '*'); END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_catalog_institutions AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON catalog_institutions FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_catalog_specialties AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON catalog_specialties FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_institution_specialties AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON institution_specialties FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_catalog_courses AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON catalog_courses FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_course_units AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_units FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_lessons AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON lessons FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_video_assets AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON video_assets FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_platform_settings AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON platform_settings FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_settings_statement();
--> statement-breakpoint
CREATE TRIGGER sync_users_account AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_course_access_account AFTER INSERT OR UPDATE OR DELETE ON course_access FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_lesson_progress_account AFTER INSERT OR UPDATE OR DELETE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_favorites_account AFTER INSERT OR UPDATE OR DELETE ON favorites FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_cart_items_account AFTER INSERT OR UPDATE OR DELETE ON cart_items FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_lesson_notes_account AFTER INSERT OR UPDATE OR DELETE ON lesson_notes FOR EACH ROW EXECUTE FUNCTION meras_sync_account_row();
CREATE TRIGGER sync_orders_commerce AFTER INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION meras_sync_commerce_row();
CREATE TRIGGER sync_invoices_commerce AFTER INSERT OR UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION meras_sync_commerce_row();
CREATE TRIGGER sync_course_requests_scoped AFTER INSERT OR UPDATE OR DELETE ON course_requests FOR EACH ROW EXECUTE FUNCTION meras_sync_request_row();
CREATE TRIGGER sync_course_request_files_scoped AFTER INSERT OR UPDATE OR DELETE ON course_request_files FOR EACH ROW EXECUTE FUNCTION meras_sync_request_row();
CREATE TRIGGER sync_support_tickets_scoped AFTER INSERT OR UPDATE OR DELETE ON support_tickets FOR EACH ROW EXECUTE FUNCTION meras_sync_support_ticket_row();
CREATE TRIGGER sync_support_replies_scoped AFTER INSERT OR UPDATE OR DELETE ON support_replies FOR EACH ROW EXECUTE FUNCTION meras_sync_support_child_row();
CREATE TRIGGER sync_support_reply_files_scoped AFTER INSERT OR UPDATE OR DELETE ON support_reply_files FOR EACH ROW EXECUTE FUNCTION meras_sync_support_child_row();
CREATE TRIGGER sync_notifications_scoped AFTER INSERT OR UPDATE OR DELETE ON notifications FOR EACH ROW EXECUTE FUNCTION meras_sync_notification_row();
--> statement-breakpoint
CREATE TRIGGER sync_users_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON users FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_orders_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON orders FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_order_items_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON order_items FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_payment_events_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON payment_events FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_invoices_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON invoices FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_course_access_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_access FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_course_requests_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_requests FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_course_request_files_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_request_files FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_support_tickets_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON support_tickets FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_support_replies_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON support_replies FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_support_reply_files_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON support_reply_files FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_notifications_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON notifications FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_coupons_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON coupons FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_course_reviews_catalog AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON course_reviews FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_catalog_statement();
CREATE TRIGGER sync_supervisor_assignments_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON supervisor_assignments FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement();
CREATE TRIGGER sync_supervisor_assignments_workspace AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON supervisor_assignments FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_supervisor_statement();
