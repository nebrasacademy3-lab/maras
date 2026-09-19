-- Indexes only: no source, result, grade or ownership records are rewritten.
-- Run with the other v7 migrations only after backup/restore and ownership review.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_artifacts_conversation_owner_idx ON ai_artifacts (conversation_id, user_id, file_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_quizzes_conversation_owner_idx ON ai_quizzes (conversation_id, user_id, file_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_file_jobs_conversation_owner_idx ON ai_file_jobs (conversation_id, user_id, file_id);
