import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { readAsMember, refuse } from "@/server/access";
import { comments, projects, revisions, videos } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

/** The same read is used to open the screen and renew its playback credentials. */
export const getReview = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; revisionId?: string }) => data)
  .handler(async ({ data }) => {
    const videoId = typeof data?.videoId === "string" ? data.videoId : "";
    const { member, results: [rows, ready, feedback] } = await readAsMember("viewer", (db) => [
      db.select({ id: videos.id, title: videos.title, projectId: videos.projectId, projectName: projects.name, completedAt: projects.completedAt })
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
    if (!video) return { member: caller, video: null, revision: null, playback: null, comments: [] as (typeof comments.$inferSelect)[] };
    // Renewal stays on the Revision being watched, even if a newer cut is ready.
    const revision = data?.revisionId ? ready.find((row) => row.id === data.revisionId) : ready[0];
    if (data?.revisionId && !revision) refuse(404, "not-found");
    const playback = revision?.muxPlaybackId && revision.durationMs !== null
      ? await getMuxGateway().createPlayback({ playbackId: revision.muxPlaybackId, durationSeconds: revision.durationMs / 1000 })
      : null;
    return {
      member: caller,
      video,
      revision: revision ? { id: revision.id, number: revision.number, frameRate: revision.frameRate, durationMs: revision.durationMs } : null,
      playback,
      comments: feedback.filter(({ comment }) => comment.revisionId === revision?.id).map(({ comment }) => comment),
    };
  });
