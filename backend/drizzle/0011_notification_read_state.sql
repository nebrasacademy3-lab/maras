CREATE TABLE "notification_reads" (
  "id" serial PRIMARY KEY NOT NULL,
  "notification_id" integer NOT NULL,
  "user_email" text NOT NULL,
  "read_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
  CONSTRAINT "notification_reads_notification_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_reads_notification_user_unique" ON "notification_reads" USING btree ("notification_id","user_email");
--> statement-breakpoint
CREATE INDEX "notification_reads_user_idx" ON "notification_reads" USING btree ("user_email","read_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION meras_sync_notification_read_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb := COALESCE(to_jsonb(NEW), to_jsonb(OLD), '{}'::jsonb);
  owner_email text := row_data->>'user_email';
BEGIN
  IF owner_email IS NOT NULL THEN
    PERFORM meras_touch_sync('notifications', 'email:' || lower(owner_email));
    PERFORM meras_touch_sync('account', 'email:' || lower(owner_email));
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sync_notification_reads_scoped AFTER INSERT OR UPDATE OR DELETE ON notification_reads FOR EACH ROW EXECUTE FUNCTION meras_sync_notification_read_row();
