CREATE TABLE `auth_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `catalog_courses` (
	`slug` text PRIMARY KEY NOT NULL,
	`institution_slug` text NOT NULL,
	`specialty_slug` text NOT NULL,
	`title` text NOT NULL,
	`title_en` text DEFAULT '' NOT NULL,
	`code` text,
	`description` text DEFAULT '' NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`old_price` real,
	`access_label` text DEFAULT '90 يومًا' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`cover_theme` text DEFAULT 'blue-violet' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_courses_institution_idx` ON `catalog_courses` (`institution_slug`);--> statement-breakpoint
CREATE INDEX `catalog_courses_specialty_idx` ON `catalog_courses` (`specialty_slug`);--> statement-breakpoint
CREATE INDEX `catalog_courses_status_idx` ON `catalog_courses` (`status`);--> statement-breakpoint
CREATE TABLE `catalog_institutions` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`region` text NOT NULL,
	`type` text NOT NULL,
	`logo_url` text,
	`domain` text,
	`status` text DEFAULT 'published' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `catalog_institutions_region_idx` ON `catalog_institutions` (`region`);--> statement-breakpoint
CREATE INDEX `catalog_institutions_status_idx` ON `catalog_institutions` (`status`);--> statement-breakpoint
CREATE TABLE `catalog_specialties` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_specialties_name_unique` ON `catalog_specialties` (`name`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'percent' NOT NULL,
	`value` real NOT NULL,
	`course_slug` text,
	`usage_limit` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE INDEX `coupons_status_idx` ON `coupons` (`status`);--> statement-breakpoint
CREATE TABLE `course_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`course_slug` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_reviews_user_course_unique` ON `course_reviews` (`user_email`,`course_slug`);--> statement-breakpoint
CREATE INDEX `course_reviews_status_idx` ON `course_reviews` (`status`);--> statement-breakpoint
CREATE TABLE `course_units` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_slug` text NOT NULL,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `course_units_course_idx` ON `course_units` (`course_slug`,`position`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`course_slug` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_course_unique` ON `favorites` (`user_email`,`course_slug`);--> statement-breakpoint
CREATE TABLE `institution_specialties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_slug` text NOT NULL,
	`specialty_slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `institution_specialties_unique` ON `institution_specialties` (`institution_slug`,`specialty_slug`);--> statement-breakpoint
CREATE INDEX `institution_specialties_lookup_idx` ON `institution_specialties` (`institution_slug`,`status`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_number` text NOT NULL,
	`order_number` text NOT NULL,
	`customer_email` text NOT NULL,
	`total` real NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SAR' NOT NULL,
	`issued_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`pdf_object_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_order_unique` ON `invoices` (`order_number`);--> statement-breakpoint
CREATE TABLE `lesson_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text NOT NULL,
	`lesson_id` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_notes_user_lesson_unique` ON `lesson_notes` (`user_email`,`lesson_id`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`course_slug` text NOT NULL,
	`unit_id` integer NOT NULL,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`free_preview` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`video_asset_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_unit_idx` ON `lessons` (`unit_id`,`position`);--> statement-breakpoint
CREATE INDEX `lessons_course_idx` ON `lessons` (`course_slug`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_email` text,
	`audience` text DEFAULT 'user' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`action_url` text,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_email`,`read_at`);--> statement-breakpoint
CREATE INDEX `notifications_audience_idx` ON `notifications` (`audience`);--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`destination_hash` text NOT NULL,
	`channel` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_destination_idx` ON `otp_challenges` (`destination_hash`,`expires_at`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role_id` integer NOT NULL,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_permissions_unique` ON `role_permissions` (`role_id`,`permission`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_key_unique` ON `roles` (`key`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`granted_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_unique` ON `user_roles` (`user_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `user_roles_role_idx` ON `user_roles` (`role_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` text;