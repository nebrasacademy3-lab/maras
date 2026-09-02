CREATE INDEX "learning_track_interests_active_notify_idx" ON "learning_track_interests" USING btree ("track_id","last_notified_version","id") WHERE "learning_track_interests"."status" = 'active';
