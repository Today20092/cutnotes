import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { readAsMember, requireMember, type ScreenDb } from "@/server/access";
import { getDb } from "@/server/db";
import { projects, videos, type RevisionState } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

const MAX_NAME_LENGTH = 120;

function reject(status: 400 | 404, code: "invalid-name" | "not-found"): never {
  throw Response.json({ code }, { status });
}

// Input is checked in the handlers, not an input validator, so Access always runs first.
function parseName(data: unknown) {
  const raw = (data as { name?: unknown } | undefined)?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) reject(400, "invalid-name");
  return name;
}

function parseProjectId(data: unknown) {
  const raw = (data as { projectId?: unknown } | undefined)?.projectId;
  return typeof raw === "string" ? raw : "";
}

const projectSummary = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  completedAt: projects.completedAt,
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
      latestRevision: sql<number | null>`(SELECT max(number) FROM revisions WHERE revisions.video_id = ${videos.id})`,
      latestRevisionState: sql<RevisionState | null>`(SELECT state FROM revisions WHERE revisions.video_id = ${videos.id} ORDER BY number DESC LIMIT 1)`,
      latestRevisionError: sql<string | null>`(SELECT error_code FROM revisions WHERE revisions.video_id = ${videos.id} ORDER BY number DESC LIMIT 1)`,
      posterPlaybackId: sql<string | null>`(SELECT mux_playback_id FROM revisions WHERE revisions.video_id = ${videos.id} AND revisions.state = 'ready' ORDER BY number DESC LIMIT 1)`,
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
async function withPosters<Video extends { posterPlaybackId: string | null }>(
  rows: Video[],
) {
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

export const listProjects = createServerFn({ method: "POST" }).handler(
  async () => {
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
  },
);

export const getProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const projectId = parseProjectId(data);
    const { member, results } = await readAsMember("viewer", (db, clerkUserId) => [
      db
        .select(projectSummary)
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))),
      selectVideos(db, clerkUserId)
        .where(and(eq(videos.projectId, projectId), liveVideo))
        .orderBy(desc(videos.updatedAt)),
    ]);
    const [project] = results[0];
    if (!project) reject(404, "not-found");
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
      .values({
        id: crypto.randomUUID(),
        name: parseName(data),
        createdBy: member.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning(projectSummary);
    return project;
  });

export const renameProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; name: string }) => data)
  .handler(async ({ data }) => {
    await requireMember("editor");
    const [project] = await getDb()
      .update(projects)
      .set({ name: parseName(data), updatedAt: Date.now() })
      .where(
        and(
          eq(projects.id, parseProjectId(data)),
          isNull(projects.deletedAt),
          // A Complete Project is read-only until it is reopened.
          isNull(projects.completedAt),
        ),
      )
      .returning(projectSummary);
    if (!project) reject(404, "not-found");
    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("owner");
    const [project] = await getDb().update(projects)
      .set({ deletedAt: Date.now() })
      .where(and(eq(projects.id, parseProjectId(data)), isNull(projects.deletedAt),
        sql`EXISTS (SELECT 1 FROM members WHERE id = ${member.id} AND role = 'owner' AND removed_at IS NULL)`))
      .returning({ id: projects.id });
    if (!project) reject(404, "not-found");
    return project;
  });
