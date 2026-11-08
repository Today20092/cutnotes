CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	`delete_after` integer,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `projects_delete_after_idx` ON `projects` (`delete_after`);--> statement-breakpoint
CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`number` integer NOT NULL,
	`state` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`mux_upload_id` text,
	`mux_asset_id` text,
	`mux_playback_id` text,
	`duration_ms` integer,
	`frame_rate` real,
	`aspect_ratio` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `revisions_video_id_number_idx` ON `revisions` (`video_id`,`number`);--> statement-breakpoint
CREATE INDEX `revisions_state_idx` ON `revisions` (`state`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `videos_project_id_idx` ON `videos` (`project_id`);