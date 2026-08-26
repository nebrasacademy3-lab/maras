CREATE TABLE `password_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_token_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `password_reset_tokens` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `supervisor_assignments_unique` ON `supervisor_assignments` (`supervisor_id`,`institution_slug`,`specialty`);