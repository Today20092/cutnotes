import { sql } from "drizzle-orm";
import { projects } from "@/server/db/schema";

// Its own module: a non-function export from a server-function file would pull server code into the browser bundle.
export const projectSummary = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  completedAt: projects.completedAt,
  deleteAfter: projects.deleteAfter,
  stage: projects.stage,
};

// Spelled out: Drizzle leaves a column unqualified in a one-table select, which is ambiguous inside a join.
const projectId = sql.raw("projects.id");

/** The Video most recently changed, whose Revision and Status a Project card hints at. */
const latestVideo = sql`(SELECT v.id FROM videos AS v WHERE v.project_id = ${projectId}
  AND v.deleted_at IS NULL ORDER BY v.updated_at DESC, v.id LIMIT 1)`;

/** What a Project card shows beyond its summary. Read only after Access is in the query. */
export const projectCard = {
  ...projectSummary,
  // Unresolved notes on each live Video's latest ready Revision.
  openNotes: sql<number>`(SELECT count(*) FROM comments AS note
    JOIN revisions AS cut ON cut.id = note.revision_id
    JOIN videos AS v ON v.id = cut.video_id
    WHERE v.project_id = ${projectId} AND v.deleted_at IS NULL AND note.resolved_at IS NULL
      AND cut.number = (SELECT max(number) FROM revisions AS latest
        WHERE latest.video_id = v.id AND latest.state = 'ready'))`.mapWith(Number),
  latestRevision: sql<number | null>`(SELECT max(number) FROM revisions
    WHERE video_id = ${latestVideo} AND state = 'ready')`,
  changesRequested: sql<boolean>`COALESCE((SELECT status = 'rework' FROM videos
    WHERE id = ${latestVideo}), 0)`.mapWith(Boolean),
};
