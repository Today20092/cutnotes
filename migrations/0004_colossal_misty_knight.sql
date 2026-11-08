CREATE TABLE `video_reads` (
	`member_id` text NOT NULL,
	`video_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `video_id`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade
);
