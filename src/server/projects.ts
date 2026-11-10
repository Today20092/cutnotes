import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import {
  activeMember,
  id,
  readAsMember,
  refuse,
  requireMember,
  text,
  type ScreenDb,
} from "@/server/access";
import { getDb } from "@/server/db";
import { projects, videos, type RevisionState } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

const MAX_NAME_LENGTH = 120;
const COUNTDOWN_MS = 14 * 24 * 60 * 60 * 1000;

const projectSummary = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  completedAt: projects.completedAt,
  deleteAfter: projects.deleteAfter,
};

const selectVideos = (db: ScreenDb, clerkUserId: string) =>
  db
    .select({
      id: videos.id,
      createdBy: videos.createdBy,
      title: videos.title,
      status: videos.status,
      updatedAt: videos.updatedAt,
      projectId: videos.projectId,
      projectName: projects.name,
      projectCompletedAt: projects.completedAt,
      unread: sql<number>`EXISTS (
        SELECT 1 FROM members AS reader
        WHERE reader.clerk_user_id = ${clerkUserId} AND reader.removed_at IS NULL AND (
          EXISTS (SELECT 1 FROM revisions AS activity WHERE activity.video_id = ${videos.id}
            AND activity.state = 'ready' AND activity.uploaded_by <> reader.id
            AND COALESCE(activity.ready_at, activity.created_at) > COALESCE((SELECT last_read_at FROM video_reads WHERE member_id = reader.id AND video_id = ${videos.id}), 0))
          OR EXISTS (SELECT 1 FROM comments AS feedback JOIN revisions AS cut ON cut.id = feedback.revision_id
            WHERE cut.video_id = ${videos.id} AND (feedback.member_id IS NULL OR feedback.member_id <> reader.id)
            AND feedback.created_at > COALESCE((SELECT last_read_at FROM video_reads WHERE member_id = reader.id AND video_id = ${videos.id}), 0))
        )
      )`.mapWith(Boolean),
      latestRevision: sql<
        number | null
      >`(SELECT max(number) FROM revisions WHERE revisions.video_id = ${videos.id})`,
      latestRevisionState: sql<RevisionState | null>`(SELECT state FROM revisions WHERE revisions.video_id = ${videos.id} ORDER BY number DESC LIMIT 1)`,
      latestRevisionError: sql<
        string | null
      >`(SELECT error_code FROM revisions WHERE revisions.video_id = ${videos.id} ORDER BY number DESC LIMIT 1)`,
      posterPlaybackId: sql<
        string | null
      >`(SELECT mux_playback_id FROM revisions WHERE revisions.video_id = ${videos.id} AND revisions.state = 'ready' ORDER BY number DESC LIMIT 1)`,
    })
    .from(videos)
    .innerJoin(projects, eq(videos.projectId, projects.id));

const liveVideo = and(isNull(videos.deletedAt), isNull(projects.deletedAt));

const SECONDS_PER_HOUR = 3600;

/**
 * Signed only after Access has passed, and never stored. The expiry snaps to
 * the hour, at least an hour away, so a refetch yields the identical token and
 * the image does not reload.
 */
async function withPosters<Video extends { posterPlaybackId: string | null }>(rows: Video[]) {
  const hour = Math.ceil(Date.now() / 1000 / SECONDS_PER_HOUR);
  const expiresAt = (hour + 1) * SECONDS_PER_HOUR;
  const mux = getMuxGateway();
  return Promise.all(
    rows.map(async ({ posterPlaybackId, ...video }) => ({
      ...video,
      posterUrl:
        posterPlaybackId === null
          ? null
          : `https://image.mux.com/${posterPlaybackId}/thumbnail.webp?token=${await mux.signPlaybackToken(
              { playbackId: posterPlaybackId, audience: "t", expiresAt },
            )}`,
    })),
  );
}

export const listProjects = createServerFn({ method: "POST" }).handler(async () => {
  const { member, results } = await readAsMember("viewer", (db, clerkUserId) => [
    db
      .select(projectSummary)
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(desc(projects.createdAt)),
    selectVideos(db, clerkUserId).where(liveVideo).orderBy(desc(videos.updatedAt)),
  ]);
  return {
    member: { id: member.id, displayName: member.displayName, role: member.role },
    projects: results[0],
    videos: await withPosters(results[1]),
  };
});

export const getProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const { member, results } = await readAsMember("viewer", (db, clerkUserId) => {
      // Reads run before the Access check, so bad input must not refuse here.
      const projectId = typeof data?.projectId === "string" ? data.projectId : "";
      return [
        db
          .select(projectSummary)
          .from(projects)
          .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))),
        selectVideos(db, clerkUserId)
          .where(and(eq(videos.projectId, projectId), liveVideo))
          .orderBy(desc(videos.updatedAt)),
      ] as const;
    });
    const [project] = results[0];
    if (!project) refuse(404, "not-found");
    return {
      member: { id: member.id, displayName: member.displayName, role: member.role },
      project,
      videos: await withPosters(results[1]),
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const now = Date.now();
    const [project] = await getDb()
      .insert(projects)
      .select(sql`SELECT ${crypto.randomUUID()}, ${text(data, "name", MAX_NAME_LENGTH, "invalid-name")}, ${member.id}, ${now}, ${now}, NULL, NULL, NULL
        WHERE ${activeMember(member.id, "editor")}`)
      .returning(projectSummary);
    if (!project) refuse(404, "not-found");
    return project;
  });

export const renameProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const [project] = await getDb()
      .update(projects)
      .set({ name: text(data, "name", MAX_NAME_LENGTH, "invalid-name"), updatedAt: Date.now() })
      .where(
        and(
          eq(projects.id, id(data, "projectId")),
          isNull(projects.deletedAt),
          // A Complete Project is read-only until it is reopened.
          isNull(projects.completedAt),
          activeMember(member.id, "editor"),
        ),
      )
      .returning(projectSummary);
    if (!project) refuse(404, "not-found");
    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("owner");
    const [project] = await getDb()
      .update(projects)
      .set({ deletedAt: Date.now() })
      .where(
        and(
          eq(projects.id, id(data, "projectId")),
          isNull(projects.deletedAt),
          activeMember(member.id, "owner"),
        ),
      )
      .returning({ id: projects.id });
    if (!project) refuse(404, "not-found");
    return project;
  });

export const completeProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("owner");
    const now = Date.now();
    const [project] = await getDb()
      .update(projects)
      .set({ completedAt: now, deleteAfter: now + COUNTDOWN_MS, updatedAt: now })
      // Only an open Project: a repeat must not move the deadline.
      .where(
        and(
          eq(projects.id, id(data, "projectId")),
          isNull(projects.deletedAt),
          isNull(projects.completedAt),
          activeMember(member.id, "owner"),
        ),
      )
      .returning(projectSummary);
    if (!project) refuse(404, "not-found");
    return project;
  });

export const reopenProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("owner");
    const now = Date.now();
    const [project] = await getDb()
      .update(projects)
      .set({ completedAt: null, deleteAfter: null, updatedAt: now })
      // Past the deadline the Project belongs to the purge, even before the hourly run reaches it.
      .where(
        and(
          eq(projects.id, id(data, "projectId")),
          isNull(projects.deletedAt),
          isNotNull(projects.completedAt),
          gt(projects.deleteAfter, now),
          activeMember(member.id, "owner"),
        ),
      )
      .returning(projectSummary);
    if (!project) refuse(404, "not-found");
    return project;
  });
