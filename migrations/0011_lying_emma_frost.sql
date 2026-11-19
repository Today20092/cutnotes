-- New links pin a Revision; NULL keeps a link made before this following the latest ready Revision.
ALTER TABLE `share_links` ADD `revision_id` text REFERENCES revisions(id) ON DELETE cascade;
