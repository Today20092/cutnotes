CREATE TABLE `folder_members` (
	`folder_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`folder_id`, `member_id`),
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `folder_members_member_idx` ON `folder_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `invites` ADD `folder_id` text REFERENCES folders(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `projects` ADD `folder_id` text REFERENCES folders(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `projects_folder_id_idx` ON `projects` (`folder_id`);