CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`member_id` text,
	`share_link_id` text,
	`author_name` text NOT NULL,
	`timecode_ms` integer NOT NULL,
	`body` text NOT NULL,
	`drawing` text,
	`resolved_at` integer,
	`resolved_by` text,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`revision_id`) REFERENCES `revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "comments_one_author" CHECK(("comments"."member_id" IS NOT NULL) <> ("comments"."share_link_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `comments_revision_id_timecode_idx` ON `comments` (`revision_id`,`timecode_ms`);