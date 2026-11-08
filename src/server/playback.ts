import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { readAsMember, refuse, requireMember } from "@/server/access";
import { getDb } from "@/server/db";
import { comments, projects, revisions, videos, videoReads } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

/** The same read is used to open the screen and renew its playback credentials. */
export const getReview = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; revisionId?: string }) => data)
  .handler(async ({ data }) => {
    const readAt = Date.now();
    const videoId = typeof data?.videoId === "string" ? data.videoId : "";
    const { member, results: [rows, ready, feedback] } = await readAsMember("viewer", (db) => [
      db.select({ id: videos.id, title: videos.title, projectId: videos.projectId, projectName: projects.name, completedAt: projects.completedAt, deleteAfter: projects.deleteAfter })
        .from(videos).innerJoin(projects, eq(videos.projectId, projects.id))
        .where(and(eq(videos.id, videoId), isNull(videos.deletedAt), isNull(projects.deletedAt))),
      db.select().from(revisions).where(and(eq(revisions.videoId, videoId), eq(revisions.state, "ready")))
        .orderBy(desc(revisions.number)),
      db.select({ comment: comments }).from(comments)
        .innerJoin(revisions, eq(comments.revisionId, revisions.id))
        .where(eq(revisions.videoId, videoId)).orderBy(comments.timecodeMs, comments.createdAt, comments.id),
    ]);
    const video = rows[0];
    const caller = { id: member.id, displayName: member.displayName, role: member.role };
    // Keep the Member with the unavailable state, so the shell needs no second read.
    if (!video) return { member: caller, readAt, video: null, revision: null, playback: null, history: [] as { id: string; number: number }[], comments: [] as (typeof comments.$inferSelect)[] };
    // Renewal stays on the Revision being watched, even if a newer cut is ready.
    const revision = data?.revisionId ? ready.find((row) => row.id === data.revisionId) : ready[0];
    if (data?.revisionId && !revision) refuse(404, "not-found");
    const playback = revision?.muxPlaybackId && revision.durationMs !== null
      ? await getMuxGateway().createPlayback({ playbackId: revision.muxPlaybackId, durationSeconds: revision.durationMs / 1000 })
      : null;
    return {
      member: caller,
      readAt,
      video,
      history: ready.map(({ id, number }) => ({ id, number })),
      revision: revision ? { id: revision.id, number: revision.number, frameRate: revision.frameRate, durationMs: revision.durationMs } : null,
      playback,
      comments: feedback.filter(({ comment }) => comment.revisionId === revision?.id).map(({ comment }) => comment),
    };
  });

/** Acknowledgement is a write; screen reads and playback renewal remain read-only. */
export const markVideoRead = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; readAt: number }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    if (typeof data?.videoId !== "string" || !Number.isSafeInteger(data?.readAt) || data.readAt < 0 || data.readAt > Date.now()) refuse(400, "invalid-request");
    const [written] = await getDb().insert(videoReads).select(sql`
      SELECT ${member.id}, videos.id, ${data.readAt} FROM videos
      JOIN projects ON projects.id = videos.project_id
      WHERE videos.id = ${data.videoId} AND videos.deleted_at IS NULL AND projects.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM members WHERE id = ${member.id} AND removed_at IS NULL)
    `).onConflictDoUpdate({ target: [videoReads.memberId, videoReads.videoId],
      set: { lastReadAt: sql`MAX(${videoReads.lastReadAt}, excluded.last_read_at)` },
    }).returning({ videoId: videoReads.videoId });
    if (!written) refuse(404, "not-found");
    return written;
  });
