ALTER TABLE "support_replies" ADD COLUMN IF NOT EXISTS "reply_to_id" integer;
CREATE INDEX IF NOT EXISTS "support_replies_reply_to_idx" ON "support_replies" USING btree ("reply_to_id");
ALTER TABLE "support_replies" DROP CONSTRAINT IF EXISTS "support_replies_reply_to_id_support_replies_id_fk";
ALTER TABLE "support_replies" ADD CONSTRAINT "support_replies_reply_to_id_support_replies_id_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."support_replies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_notification_read_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb := COALESCE(to_jsonb(NEW), to_jsonb(OLD), '{}'::jsonb);
  target_user_id integer := NULLIF(row_data->>'user_id', '')::integer;
  target_email text;
BEGIN
  IF target_user_id IS NOT NULL THEN
    SELECT email INTO target_email FROM users WHERE id = target_user_id;
    PERFORM meras_touch_sync('notifications', 'user:' || target_user_id::text);
    IF target_email IS NOT NULL THEN
      PERFORM meras_touch_sync('notifications', 'email:' || lower(target_email));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_notification_reads_scoped ON notification_reads;
CREATE TRIGGER sync_notification_reads_scoped AFTER INSERT OR UPDATE OR DELETE ON notification_reads FOR EACH ROW EXECUTE FUNCTION meras_sync_notification_read_row();
