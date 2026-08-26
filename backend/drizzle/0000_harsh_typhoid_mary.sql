CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`anonymous_id` text,
	`user_email` text,
	`course_slug` text,
	`metadata_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_event_idx` ON `analytics_events` (`event`);--> statement-breakpoint
CREATE INDEX `analytics_course_idx` ON `analytics_events` (`course_slug`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`ip_address` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_actor_idx` ON `audit_logs` (`actor_email`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `course_access` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`course_slug` text NOT NULL,
	`source` text DEFAULT 'purchase' NOT NULL,
	`order_number` text,
	`starts_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_access_user_course_unique` ON `course_access` (`user_email`,`course_slug`);--> statement-breakpoint
CREATE INDEX `course_access_course_idx` ON `course_access` (`course_slug`);--> statement-breakpoint
CREATE TABLE `course_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`university` text NOT NULL,
	`specialty` text NOT NULL,
	`course_name` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`notify` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `course_requests_course_idx` ON `course_requests` (`course_name`);--> statement-breakpoint
CREATE INDEX `course_requests_status_idx` ON `course_requests` (`status`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`course_slug` text NOT NULL,
	`lesson_id` text NOT NULL,
	`watched_seconds` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_progress_unique` ON `lesson_progress` (`user_email`,`lesson_id`);--> statement-breakpoint
CREATE INDEX `lesson_progress_course_idx` ON `lesson_progress` (`course_slug`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text,
	`course_slug` text NOT NULL,
	`subtotal` real NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`total` real NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`tap_charge_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`paid_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_email`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_tap_charge_unique` ON `orders` (`tap_charge_id`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'tap' NOT NULL,
	`provider_event_id` text,
	`order_number` text,
	`charge_id` text,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_events_charge_idx` ON `payment_events` (`charge_id`);--> statement-breakpoint
CREATE INDEX `payment_events_order_idx` ON `payment_events` (`order_number`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_number` text NOT NULL,
	`user_email` text,
	`category` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`assigned_to` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_ticket_number_unique` ON `support_tickets` (`ticket_number`);--> statement-breakpoint
CREATE INDEX `support_status_idx` ON `support_tickets` (`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`full_name` text NOT NULL,
	`university_slug` text,
	`specialty` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `video_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_slug` text NOT NULL,
	`lesson_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`duration_seconds` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_object_key_unique` ON `video_assets` (`object_key`);--> statement-breakpoint
CREATE INDEX `video_lesson_idx` ON `video_assets` (`course_slug`,`lesson_id`);