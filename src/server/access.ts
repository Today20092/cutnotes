import { auth } from "@clerk/tanstack-react-start/server";
import { getRequestHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { and, eq, inArray, isNull, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, type Db } from "@/server/db";
import {
  members,
  projectMembers,
  projects,
  revisions,
  roles,
  shareLinks,
  videos,
  type Member,
  type Role,
} from "@/server/db/schema";

export type RefusalCode =
  | "signed-out"
  | "not-a-member"
  | "insufficient-role"
  | "invalid-request"
  | "not-found"
  | "last-owner"
  | "rate-limited"
  | "invalid-name"
  | "invalid-title"
  | "invalid-status"
  | "already-sent"
  | "upload-unavailable";

type BatchResults<Reads extends readonly unknown[]> = {
  -readonly [Index in keyof Reads]: Awaited<Reads[Index]>;
};

export function refuse(status: 400 | 401 | 403 | 404 | 409 | 429 | 502, code: RefusalCode): never {
  throw Response.json({ code }, { status });
}

export function parse<Schema extends v.GenericSchema>(
  schema: Schema,
  data: unknown,
): v.InferOutput<Schema> {
  const result = v.safeParse(schema, data);
  if (!result.success) refuse(400, "invalid-request");
  return result.output;
}

/** Public feedback needs no identity, including when Clerk cannot load. */
export async function allowPublicFeedback() {
  const address = getRequestHeader("cf-connecting-ip");
  if (address && !(await env.FEEDBACK_LIMIT.limit({ key: address })).success)
    refuse(429, "rate-limited");
}

// Input is read in the handlers, not an input validator, so Access always runs first.
const fieldOf = (data: unknown, field: string) =>
  (data as Record<string, unknown> | undefined)?.[field];

/** A trimmed, non-empty text field of at most `max` characters. */
export function text(
  data: unknown,
  field: string,
  max: number,
  code: RefusalCode = "invalid-request",
) {
  const raw = fieldOf(data, field);
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value || value.length > max) refuse(400, code);
  return value;
}

/** A non-empty identifier field, bounded so forged input cannot bloat a query. */
export function id(data: unknown, field: string) {
  const raw = fieldOf(data, field);
  if (typeof raw !== "string" || !raw || raw.length > 128) refuse(400, "invalid-request");
  return raw;
}

/** The Role check for a write. A screen's reads use `readAsMember`. Refuses by throwing a Response. */
export async function requireMember(minimumRole: Role): Promise<Member> {
  const { member } = await readAsMember(minimumRole, () => []);
  return member;
}

/** Re-check Access in the write itself, after any competing removal or demotion. */
export const activeMember = (memberId: string, minimumRole: Role) =>
  sql`EXISTS (SELECT 1 FROM members AS acting WHERE acting.id = ${memberId}
    AND acting.removed_at IS NULL AND ${inArray(sql`acting.role`, roles.slice(roles.indexOf(minimumRole)))})`;

export const memberIdForUser = (clerkUserId: string) =>
  sql`(SELECT id FROM members WHERE clerk_user_id = ${clerkUserId})`;

/** Team roles control creation; project roles control access to existing work. */
export const projectAccess = (
  memberId: string | SQLWrapper,
  projectId: string | SQLWrapper,
  minimumRole: "viewer" | "editor" = "viewer",
) =>
  sql`EXISTS (SELECT 1 FROM members AS project_actor
    JOIN projects AS accessible ON accessible.id = ${projectId} AND accessible.deleted_at IS NULL
    WHERE project_actor.id = ${memberId} AND project_actor.removed_at IS NULL
      AND (project_actor.role = 'owner' OR EXISTS (
        SELECT 1 FROM project_members AS assignment
        WHERE assignment.member_id = project_actor.id AND assignment.project_id = accessible.id
          AND ${minimumRole === "editor" ? sql`assignment.role = 'editor'` : sql`1 = 1`}
      )))`;

export const projectRole = (memberId: string | SQLWrapper, projectId: string | SQLWrapper) =>
  sql<Role>`CASE WHEN EXISTS (SELECT 1 FROM members AS role_actor WHERE role_actor.id = ${memberId}
      AND role_actor.role = 'owner' AND role_actor.removed_at IS NULL) THEN 'owner'
    ELSE (SELECT assignment.role FROM project_members AS assignment
      WHERE assignment.member_id = ${memberId} AND assignment.project_id = ${projectId}) END`;

export const videoAccess = (
  memberId: string | SQLWrapper,
  videoId: string | SQLWrapper,
  minimumRole: "viewer" | "editor" = "viewer",
) =>
  sql`EXISTS (SELECT 1 FROM videos AS accessible_video WHERE accessible_video.id = ${videoId}
    AND accessible_video.deleted_at IS NULL AND ${projectAccess(memberId, sql`accessible_video.project_id`, minimumRole)})`;

/** The Project still takes writes: live and not Complete. */
export const openProject = (projectId: string | SQLWrapper) =>
  sql`EXISTS (SELECT 1 FROM projects AS open WHERE open.id = ${projectId}
    AND open.deleted_at IS NULL AND open.completed_at IS NULL)`;

/** The Video still takes writes: live, inside an open Project. */
export const writableVideo = (videoId: string | SQL) =>
  sql`EXISTS (SELECT 1 FROM videos AS live WHERE live.id = ${videoId}
    AND live.deleted_at IS NULL AND ${openProject(sql`live.project_id`)})`;

/** The Revision takes comments: ready, on a writable Video. */
export const readyRevision = (revisionId: string, videoId: string) =>
  sql`EXISTS (SELECT 1 FROM revisions AS cut WHERE cut.id = ${revisionId}
    AND cut.video_id = ${videoId} AND cut.state = 'ready' AND ${writableVideo(videoId)})`;

/** Selects only: a screen's reads run before the Role is checked, so they must change nothing. */
export type ScreenDb = Pick<Db, "select">;

/**
 * Every screen loads through this: the caller's Member row and the screen's
 * reads travel in one D1 batch, giving one database trip. Build each read from
 * the `db` given to `reads`. The results are discarded if the caller is refused.
 */
export async function readAsMember<const Reads extends readonly BatchItem<"sqlite">[]>(
  minimumRole: Role,
  reads: (db: ScreenDb, clerkUserId: string) => Reads,
): Promise<{ member: Member; results: BatchResults<Reads> }> {
  const { userId, sessionClaims } = await auth();
  if (!userId) refuse(401, "signed-out");

  let [member, results] = await readBatch(userId, reads);
  if (!member && (await claimFirstOwner(userId, sessionClaims))) {
    [member, results] = await readBatch(userId, reads);
  }
  if (!member || member.removedAt !== null) refuse(403, "not-a-member");
  if (roles.indexOf(member.role) < roles.indexOf(minimumRole)) {
    refuse(403, "insufficient-role");
  }
  return { member, results };
}

/**
 * The Guest counterpart of `readAsMember`: the token alone picks the Video and
 * its latest ready Revision. Every dead link gets the same refusal.
 */
export async function readShareLink(token: unknown) {
  const address = getRequestHeader("cf-connecting-ip");
  if (address && !(await env.SHARE_ADDRESS_LIMIT.limit({ key: address })).success)
    refuse(429, "rate-limited");
  if (typeof token !== "string" || !/^[0-9A-Za-z]{32}$/.test(token)) refuse(404, "not-found");
  const [link] = await getDb()
    .select({
      id: shareLinks.id,
      permission: shareLinks.permission,
      title: videos.title,
      projectName: projects.name,
      revisionId: revisions.id,
      number: revisions.number,
      frameRate: revisions.frameRate,
      durationMs: revisions.durationMs,
      playbackId: revisions.muxPlaybackId,
    })
    .from(shareLinks)
    .innerJoin(videos, eq(videos.id, shareLinks.videoId))
    .innerJoin(projects, eq(projects.id, videos.projectId))
    .innerJoin(
      revisions,
      sql`${revisions.id} = (SELECT latest.id FROM revisions AS latest
      WHERE latest.video_id = ${videos.id} AND latest.state = 'ready' ORDER BY latest.number DESC LIMIT 1)`,
    )
    .where(
      and(
        eq(shareLinks.token, token),
        isNull(shareLinks.revokedAt),
        isNull(videos.deletedAt),
        isNull(projects.deletedAt),
        isNull(projects.completedAt),
      ),
    );
  if (!link || link.playbackId === null || link.durationMs === null) refuse(404, "not-found");
  return { ...link, playbackId: link.playbackId, durationMs: link.durationMs };
}

export type SignedInPerson = { clerkUserId: string; displayName: string };

/** Who is calling, for the one action that makes a signed-in person a Member. */
export async function requireSignedIn(): Promise<SignedInPerson> {
  const { userId, sessionClaims } = await auth();
  if (!userId) refuse(401, "signed-out");
  const email = sessionClaims?.email;
  return {
    clerkUserId: userId,
    displayName: typeof email === "string" && email ? email : "Member",
  };
}

/** Changes a Member's Role. The Team always keeps at least one active Owner. */
export function setMemberRole(caller: Member, targetId: string, role: Role) {
  return writeActiveMember(caller, targetId, { role }, role === "owner");
}

/** Ends a Member's access. The row stays, so their name stays on their Comments. */
export function removeActiveMember(caller: Member, targetId: string) {
  return writeActiveMember(caller, targetId, { removedAt: Date.now() }, false);
}

/**
 * One conditional statement decides each write, so simultaneous requests cannot
 * leave the Team without an Owner, and an Owner demoted or removed since their
 * Access check cannot act. Column names are spelled out in the subqueries so
 * they read the aliased rows and not the row being updated.
 */
async function writeActiveMember(
  caller: Member,
  targetId: string,
  change: Partial<Pick<Member, "role" | "removedAt">>,
  targetStaysOwner: boolean,
) {
  const db = getDb();
  const keepsAnOwner: SQL | undefined = targetStaysOwner
    ? undefined
    : or(
        sql`${members.role} <> 'owner'`,
        sql`EXISTS (SELECT 1 FROM members AS other
              WHERE other.role = 'owner' AND other.removed_at IS NULL AND other.id <> ${targetId})`,
      );

  const [written, , rows] = await db.batch([
    db
      .update(members)
      .set(change)
      .where(
        and(
          eq(members.id, targetId),
          isNull(members.removedAt),
          sql`EXISTS (SELECT 1 FROM members AS acting
                WHERE acting.id = ${caller.id} AND acting.role = 'owner' AND acting.removed_at IS NULL)`,
          keepsAnOwner,
        ),
      ),
    db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.memberId, targetId),
          sql`EXISTS (SELECT 1 FROM members WHERE id = ${targetId} AND removed_at IS NOT NULL)`,
        ),
      ),
    db
      .select()
      .from(members)
      .where(inArray(members.id, [caller.id, targetId])),
  ]);
  if (written.meta.changes === 1) return;

  const acting = rows.find((row) => row.id === caller.id);
  if (acting?.role !== "owner" || acting.removedAt !== null) {
    refuse(403, "insufficient-role");
  }
  const target = rows.find((row) => row.id === targetId);
  if (!target || target.removedAt !== null) refuse(404, "not-found");
  refuse(409, "last-owner");
}

async function readBatch<const Reads extends readonly BatchItem<"sqlite">[]>(
  clerkUserId: string,
  reads: (db: ScreenDb, clerkUserId: string) => Reads,
): Promise<[Member | undefined, BatchResults<Reads>]> {
  const db = getDb();
  const [memberRows, ...results] = (await db.batch([
    db.select().from(members).where(eq(members.clerkUserId, clerkUserId)),
    ...reads(db, clerkUserId),
  ] as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]])) as unknown as [
    Member[],
    ...BatchResults<Reads>,
  ];
  return [memberRows[0], results as unknown as BatchResults<Reads>];
}

/** The setup email becomes the first Owner, and the single statement makes it first-come only. */
async function claimFirstOwner(
  clerkUserId: string,
  claims: Record<string, unknown> | null | undefined,
) {
  const email = typeof claims?.email === "string" ? claims.email : "";
  const configured = env.FIRST_OWNER_EMAIL.trim().toLowerCase();
  if (!configured || claims?.email_verified !== true) return undefined;
  if (email.trim().toLowerCase() !== configured) return undefined;

  const [created] = await getDb()
    .insert(members)
    .select(
      sql`SELECT ${crypto.randomUUID()}, ${clerkUserId}, ${email}, 'owner', ${Date.now()}, NULL
          WHERE NOT EXISTS (SELECT 1 FROM ${members} WHERE ${members.role} = 'owner')`,
    )
    .onConflictDoNothing()
    .returning();
  return created;
}
