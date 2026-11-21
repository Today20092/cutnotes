CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`member_id` text NOT NULL,
	`role` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `member_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `project_members_member_idx` ON `project_members` (`member_id`);--> statement-breakpoint
ALTER TABLE `invites` ADD `project_id` text REFERENCES projects(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `invites` ADD `note` text;
--> statement-breakpoint
-- Existing projects retain their creators; owners have implicit access.
INSERT INTO project_members (project_id, member_id, role, added_by, created_at)
SELECT p.id, p.created_by, 'editor', p.created_by, p.created_at
FROM projects p JOIN members m ON m.id = p.created_by WHERE m.removed_at IS NULL;
