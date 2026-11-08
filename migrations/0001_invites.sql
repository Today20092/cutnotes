CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by` text,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`used_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);