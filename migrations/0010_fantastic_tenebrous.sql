ALTER TABLE `projects` ADD `stage` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
-- Backfill: a ready Revision and every live Video done is Done; any ready Revision is In review; else New.
UPDATE `projects` SET `stage` = CASE
  WHEN EXISTS (SELECT 1 FROM `videos` v JOIN `revisions` r ON r.`video_id` = v.`id`
      WHERE v.`project_id` = `projects`.`id` AND v.`deleted_at` IS NULL AND r.`state` = 'ready')
    AND NOT EXISTS (SELECT 1 FROM `videos` v
      WHERE v.`project_id` = `projects`.`id` AND v.`deleted_at` IS NULL AND v.`status` <> 'done')
    THEN 'done'
  WHEN EXISTS (SELECT 1 FROM `videos` v JOIN `revisions` r ON r.`video_id` = v.`id`
      WHERE v.`project_id` = `projects`.`id` AND v.`deleted_at` IS NULL AND r.`state` = 'ready')
    THEN 'in_review'
  ELSE 'new'
END;
