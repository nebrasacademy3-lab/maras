CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`is_public` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_settings_category_idx` ON `platform_settings` (`category`,`is_public`);--> statement-breakpoint
CREATE TABLE `support_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`author_email` text NOT NULL,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_replies_ticket_idx` ON `support_replies` (`ticket_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `catalog_institutions` ADD `featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `coupon_code` text;