import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { and, asc, desc, eq, gt, isNotNull, isNull, ne, sql, type SQLWrapper } from "drizzle-orm";
import {
  activeMember,
  memberIdForUser,
  projectAccess,
  projectRole,
  id,
  parse,
  readAsMember,
  refuse,
  requireMember,
  text,
  type ScreenDb,
} from "@/server/access";
import { getDb } from "@/server/db";
import {
  members,
  projectMembers,
  projects,
  projectStages,
  videos,
  type ProjectStage,
  type RevisionState,
} from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";
import { projectCard, projectSummary } from "@/server/project-summary";

const MAX_NAME_LENGTH = 120;
const COUNTDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Non-Owner Members assigned to Projects the caller can open. Owners have implicit access and are omitted. */
const selectPeople = (db: ScreenDb, memberId: string | SQLWrapper, projectId?: string) =>
  db
    .select({
      projectId: projectMembers.projectId,
      id: members.id,
      displayName: members.displayName,
      avatarUrl: members.avatarUrl,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(members, eq(members.id, projectMembers.memberId))
    .where(
      and(
        projectId === undefined ? undefined : eq(projectMembers.projectId, projectId),
        isNull(members.removedAt),
        ne(members.role, "owner"),
        projectAccess(memberId, projectMembers.projectId),
      ),
    )
    .orderBy(asc(projectMembers.createdAt), asc(members.id));

const selectVideos = (db: ScreenDb, clerkUserId: string) =>
  db
    .select({
      id: videos.id,
      role: projectRole(memberIdForUser(clerkUserId), videos.projectId),
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
          : (mux.thumbnailUrl?.(posterPlaybackId) ??
            `https://image.mux.com/${posterPlaybackId}/thumbnail.webp?token=${await mux.signPlaybackToken(
              { playbackId: posterPlaybackId, audience: "t", expiresAt },
            )}`),
    })),
  );
}

export const listProjects = createServerFn({ method: "POST" }).handler(async () => {
  const { member, results } = await readAsMember("viewer", (db, clerkUserId) => [
    db
      .select({
        ...projectCard,
        role: projectRole(memberIdForUser(clerkUserId), projects.id),
      })
      .from(projects)
      .where(projectAccess(memberIdForUser(clerkUserId), projects.id))
      .orderBy(desc(projects.createdAt)),
    selectVideos(db, clerkUserId)
      .where(and(liveVideo, projectAccess(memberIdForUser(clerkUserId), videos.projectId)))
      .orderBy(desc(videos.updatedAt)),
    selectPeople(db, memberIdForUser(clerkUserId)),
  ]);
  return {
    member: { id: member.id, displayName: member.displayName, role: member.role },
    projects: results[0].map((project) => ({
      ...project,
      people: results[2].filter((person) => person.projectId === project.id),
    })),
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
          .select({
            ...projectCard,
            role: projectRole(memberIdForUser(clerkUserId), projects.id),
          })
          .from(projects)
          .where(
            and(
              eq(projects.id, projectId),
              projectAccess(memberIdForUser(clerkUserId), projects.id),
            ),
          ),
        selectVideos(db, clerkUserId)
          .where(
            and(
              eq(videos.projectId, projectId),
              liveVideo,
              projectAccess(memberIdForUser(clerkUserId), videos.projectId),
            ),
          )
          .orderBy(desc(videos.updatedAt)),
        selectPeople(db, memberIdForUser(clerkUserId), projectId),
      ] as const;
    });
    const [project] = results[0];
    if (!project) refuse(404, "not-found");
    return {
      member: { id: member.id, displayName: member.displayName, role: member.role },
      project: { ...project, people: results[2] },
      videos: await withPosters(results[1]),
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const name = text(data, "name", MAX_NAME_LENGTH, "invalid-name");
    const now = Date.now();
    const projectId = crypto.randomUUID();
    const db = getDb();
    const [created] = await db.batch([
      db
        .insert(projects)
        .select(sql`SELECT ${projectId}, ${name}, ${member.id}, ${now}, ${now}, NULL, NULL, NULL, 'new'
        WHERE ${activeMember(member.id, "editor")}`)
        .returning(projectSummary),
      db.insert(projectMembers)
        .select(sql`SELECT ${projectId}, ${member.id}, 'editor', ${member.id}, ${now}
          WHERE EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND created_by = ${member.id})
            AND ${activeMember(member.id, "editor")}`),
    ]);
    const project = created[0];
    if (!project) refuse(404, "not-found");
    return project;
  });

export const renameProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    const [project] = await getDb()
      .update(projects)
      .set({ name: text(data, "name", MAX_NAME_LENGTH, "invalid-name"), updatedAt: Date.now() })
      .where(
        and(
          eq(projects.id, id(data, "projectId")),
          isNull(projects.deletedAt),
          // A Complete Project is read-only until it is reopened.
          isNull(projects.completedAt),
          projectAccess(member.id, projects.id, "editor"),
        ),
      )
      .returning(projectSummary);
    if (!project) refuse(404, "not-found");
    return project;
  });

const stageSchema = v.object({
  projectId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  stage: v.picklist(projectStages),
});

/** Owners and the Project's Editors move it by hand, on the board or a card's menu. */
export const setProjectStage = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; stage: ProjectStage }) => data)
  .handler(async ({ data: raw }) => {
    const member = await requireMember("viewer");
    const data = parse(stageSchema, raw);
    const [project] = await getDb()
      .update(projects)
      .set({ stage: data.stage, updatedAt: Date.now() })
      .where(
        and(
          eq(projects.id, data.projectId),
          isNull(projects.deletedAt),
          isNull(projects.completedAt),
          projectAccess(member.id, projects.id, "editor"),
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
