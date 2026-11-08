CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`clerk_user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_clerk_user_id_unique` ON `members` (`clerk_user_id`);