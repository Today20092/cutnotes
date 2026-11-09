import { auth } from "@clerk/tanstack-react-start/server";
import { getRequestHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, type Db } from "@/server/db";
import {
  members,
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
  | "rate-limited";

type BatchResults<Reads extends readonly unknown[]> = {
  -readonly [Index in keyof Reads]: Awaited<Reads[Index]>;
};

export function refuse(status: 400 | 401 | 403 | 404 | 409 | 429, code: RefusalCode): never {
  throw Response.json({ code }, { status });
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

  const [written, rows] = await db.batch([
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
