CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_expires_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_request_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_request_files_object_unique` ON `course_request_files` (`object_key`);--> statement-breakpoint
CREATE INDEX `course_request_files_request_idx` ON `course_request_files` (`request_id`);--> statement-breakpoint
CREATE TABLE `supervisor_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`supervisor_id` integer NOT NULL,
	`institution_slug` text,
	`specialty` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `supervisor_assignments_user_idx` ON `supervisor_assignments` (`supervisor_id`,`active`);--> statement-breakpoint
CREATE INDEX `supervisor_assignments_scope_idx` ON `supervisor_assignments` (`institution_slug`,`specialty`);--> statement-breakpoint
ALTER TABLE `course_requests` ADD `user_id` integer;--> statement-breakpoint
ALTER TABLE `course_requests` ADD `university_slug` text;--> statement-breakpoint
ALTER TABLE `course_requests` ADD `assigned_supervisor_id` integer;--> statement-breakpoint
ALTER TABLE `course_requests` ADD `attachments_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_requests` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
CREATE INDEX `course_requests_user_idx` ON `course_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `course_requests_supervisor_idx` ON `course_requests` (`assigned_supervisor_id`,`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_completed_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` text;