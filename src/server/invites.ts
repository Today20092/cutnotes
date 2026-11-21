import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  activeMember,
  id,
  readAsMember,
  refuse,
  requireMember,
  requireSignedIn,
  type SignedInPerson,
} from "@/server/access";
import { getDb } from "@/server/db";
import { startEditing } from "@/server/project-stage";
import {
  invites,
  members,
  projectMembers,
  projectRoles,
  projects,
  roles,
  type InviteRole,
} from "@/server/db/schema";

const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const isPending = (now: number) =>
  and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now));

const roleLabels: Record<InviteRole, string> = {
  viewer: "a Reviewer",
  uploader: "an Uploader",
  editor: "an Editor",
  owner: "an Owner",
};

/** Reading a preview must never redeem the Invite. */
export const getInvitePreview = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (typeof data?.token !== "string" || !/^[\w-]{43}$/.test(data.token)) return null;
    const [invite] = await getDb()
      .select({
        role: invites.role,
        projectId: invites.projectId,
        projectName: projects.name,
      })
      .from(invites)
      .leftJoin(projects, and(eq(projects.id, invites.projectId), isNull(projects.deletedAt)))
      .where(and(eq(invites.tokenHash, await sha256(data.token)), isPending(Date.now())));
    if (!invite || (invite.projectId && !invite.projectName)) return null;
    const scope = invite.projectName;
    return {
      title: scope ? `You're invited to ${scope}` : `You're invited to join ${env.TEAM_NAME}`,
      description: scope
        ? `Join ${scope} as ${roleLabels[invite.role]}. Sign in to accept. This invitation works once and expires after 7 days.`
        : `Join ${env.TEAM_NAME} as ${invite.role === "owner" ? "an" : "a"} ${invite.role} on Cutnotes. Sign in to accept. This invitation works once and expires after 7 days.`,
      image: env.TEAM_LOGO_URL,
    };
  });

const pendingFields = {
  projectId: invites.projectId,
  note: invites.note,
  usedAt: invites.usedAt,
  revokedAt: invites.revokedAt,
  usedBy: invites.usedBy,
  id: invites.id,
  role: invites.role,
  createdAt: invites.createdAt,
  expiresAt: invites.expiresAt,
};

export type PendingInvite = {
  id: string;
  role: InviteRole;
  createdAt: number;
  expiresAt: number;
  projectId: string | null;
  note: string | null;
};

/** The token exists only in this response. Afterwards the server holds just its hash. */
export const createInvite = createServerFn({ method: "POST" })
  .validator((data: { role: InviteRole; projectId?: string; note?: string }) => data)
  .handler(async ({ data }): Promise<{ url: string; invite: PendingInvite }> => {
    const owner = await requireMember("owner");
    const projectId = data?.projectId === undefined ? null : id(data, "projectId");
    // A Project Invite offers an assignment; a Team Invite offers a Team Role.
    const offered: readonly InviteRole[] = projectId ? projectRoles : roles;
    const role = offered.find((known) => known === (data as { role?: unknown } | undefined)?.role);
    if (!role) refuse(400, "invalid-request");
    if (data.note !== undefined && (typeof data.note !== "string" || data.note.length > 240))
      refuse(400, "invalid-request");
    const note = data.note?.trim() || null;

    const token = newToken();
    const now = Date.now();
    const invite = {
      id: crypto.randomUUID(),
      projectId,
      note,
      role,
      createdAt: now,
      expiresAt: now + inviteLifetimeMs,
    };
    const [created] = await getDb()
      .insert(invites)
      .select(sql`SELECT ${invite.id}, ${await sha256(token)}, ${role}, ${owner.id}, ${now}, ${invite.expiresAt}, NULL, NULL, NULL, ${projectId}, ${note}
        WHERE ${activeMember(owner.id, "owner")}
          AND (${projectId} IS NULL OR EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND deleted_at IS NULL))`)
      .returning({ id: invites.id });
    if (!created) refuse(403, "insufficient-role");
    return { url: `${env.APP_ORIGIN}/invite/${token}`, invite };
  });

export const listInvites = createServerFn({ method: "POST" })
  .validator((data: { projectId?: string } | undefined) => data)
  .handler(async ({ data }) => {
    const projectId = typeof data?.projectId === "string" ? data.projectId : undefined;
    const { results } = await readAsMember("owner", (db) => [
      db
        .select({
          ...pendingFields,
          role: invites.role,
          createdBy: sql<string>`(SELECT display_name FROM members AS creator WHERE creator.id = ${invites.createdBy})`,
          acceptedBy: sql<
            string | null
          >`(SELECT display_name FROM members AS accepter WHERE accepter.id = ${invites.usedBy})`,
          projectName: projects.name,
        })
        .from(invites)
        .leftJoin(projects, eq(projects.id, invites.projectId))
        .where(projectId ? eq(invites.projectId, projectId) : undefined)
        .orderBy(desc(invites.createdAt)),
    ]);
    return { invites: results[0] };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const inviteId = id(data, "id");

    const [revoked] = await getDb()
      .update(invites)
      .set({ revokedAt: Date.now() })
      .where(
        and(
          eq(invites.id, inviteId),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          activeMember(owner.id, "owner"),
        ),
      )
      .returning({ id: invites.id });
    if (!revoked) refuse(404, "not-found");
    return null;
  });

export type RedeemResult =
  | { outcome: "joined"; projectId?: string }
  | { outcome: "already-member"; projectId?: string }
  | { outcome: "unavailable"; reason: "used" | "expired" | "revoked" | "unknown" };

function unavailableReason(
  invite: Pick<PendingInvite, "expiresAt"> & { usedAt: number | null; revokedAt: number | null },
  now: number,
) {
  if (invite.revokedAt !== null) return "revoked";
  if (invite.usedAt !== null) return "used";
  if (invite.expiresAt <= now) return "expired";
}

/**
 * One D1 batch, so of any simultaneous redemptions exactly one marks the Invite
 * used. A new person gets a new row. A removed Member keeps their row and name,
 * so their old Comments stay theirs, and is reinstated. An active Member matches
 * neither branch, so the Invite stays unused.
 */
async function redeem(person: SignedInPerson, tokenHash: string): Promise<RedeemResult> {
  const db = getDb();
  const now = Date.now();
  const newMemberId = crypto.randomUUID();
  const redeemable = and(eq(invites.tokenHash, tokenHash), isPending(now));
  const isCaller = eq(members.clerkUserId, person.clerkUserId);

  const [, marked, , callerRows, inviteRows] = await db.batch([
    db.insert(members).select(
      sql`SELECT ${newMemberId}, ${person.clerkUserId}, ${person.displayName}, ${invites.role}, ${now}, NULL, NULL
          FROM ${invites}
          WHERE ${redeemable}
            AND NOT EXISTS (SELECT 1 FROM ${members} WHERE ${isCaller})`,
    ),
    db
      .update(invites)
      .set({
        usedAt: now,
        usedBy: sql`(SELECT ${members.id} FROM ${members} WHERE ${isCaller})`,
      })
      .where(
        and(
          redeemable,
          sql`EXISTS (SELECT 1 FROM ${members} WHERE ${isCaller}
                AND (${members.id} = ${newMemberId} OR ${members.removedAt} IS NOT NULL))`,
        ),
      ),
    db
      .update(members)
      .set({
        removedAt: null,
        role: sql`(SELECT ${invites.role} FROM ${invites} WHERE ${invites.tokenHash} = ${tokenHash})`,
      })
      .where(
        and(
          isCaller,
          sql`${members.removedAt} IS NOT NULL`,
          sql`changes() = 1`,
          sql`EXISTS (SELECT 1 FROM ${invites}
                WHERE ${invites.tokenHash} = ${tokenHash}
                  AND ${invites.usedAt} = ${now}
                  AND ${invites.usedBy} = ${members.id})`,
        ),
      ),
    db.select().from(members).where(isCaller),
    db.select().from(invites).where(eq(invites.tokenHash, tokenHash)),
  ]);

  if (marked.meta.changes === 1) return { outcome: "joined" };
  const invite = inviteRows[0];
  const reason = invite ? unavailableReason(invite, now) : "unknown";
  if (reason) return { outcome: "unavailable", reason };
  const caller = callerRows[0];
  if (caller && caller.removedAt === null) return { outcome: "already-member" };
  return { outcome: "unavailable", reason: "unknown" };
}

/** Not Member-gated: this is how a signed-in person becomes a Member. */
export const redeemInvite = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<RedeemResult> => {
    const person = await requireSignedIn();
    const tokenHash = await sha256(id(data, "token"));
    const [invite] = await getDb()
      .select({ projectId: invites.projectId })
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash));
    return invite?.projectId
      ? redeemProject(person, tokenHash, invite.projectId)
      : redeem(person, tokenHash);
  });

/** Claim and assignment share a batch: only the request that consumes the token grants access. */
async function redeemProject(
  person: SignedInPerson,
  tokenHash: string,
  projectId: string,
): Promise<RedeemResult> {
  const db = getDb();
  const now = Date.now();
  const newMemberId = crypto.randomUUID();
  const redeemable = and(
    eq(invites.tokenHash, tokenHash),
    isPending(now),
    sql`EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND deleted_at IS NULL)`,
  );
  const isCaller = eq(members.clerkUserId, person.clerkUserId);
  const [, marked, , , , callerRows, inviteRows, assignmentRows] = await db.batch([
    db.insert(members)
      .select(sql`SELECT ${newMemberId}, ${person.clerkUserId}, ${person.displayName}, 'viewer', ${now}, NULL, NULL
      FROM invites WHERE ${redeemable} AND NOT EXISTS (SELECT 1 FROM members WHERE ${isCaller})`),
    db
      .update(invites)
      .set({ usedAt: now, usedBy: sql`(SELECT id FROM members WHERE ${isCaller})` })
      .where(
        and(
          redeemable,
          sql`EXISTS (SELECT 1 FROM members WHERE ${isCaller}
        AND (removed_at IS NOT NULL OR (role <> 'owner' AND NOT EXISTS (
          SELECT 1 FROM project_members WHERE member_id = members.id AND project_id = ${projectId}))))`,
        ),
      ),
    db.insert(projectMembers).select(sql`SELECT ${projectId}, m.id, i.role, i.created_by, ${now}
      FROM invites i JOIN members m ON m.id = i.used_by
      WHERE changes() = 1 AND i.token_hash = ${tokenHash} AND i.used_at = ${now} AND m.clerk_user_id = ${person.clerkUserId}
        AND NOT EXISTS (SELECT 1 FROM project_members WHERE project_id = ${projectId} AND member_id = m.id)`),
    db
      .update(members)
      .set({ removedAt: null, role: "viewer" })
      .where(
        and(
          isCaller,
          sql`${members.removedAt} IS NOT NULL`,
          sql`changes() = 1`,
          sql`EXISTS (SELECT 1 FROM invites WHERE token_hash = ${tokenHash} AND used_at = ${now} AND used_by = members.id)`,
        ),
      ),
    // Last write: the statements above chain on changes().
    startEditing(
      db,
      projectId,
      sql`EXISTS (SELECT 1 FROM invites AS used JOIN members AS joiner ON joiner.id = used.used_by
        AND joiner.removed_at IS NULL
        JOIN project_members AS crew ON crew.member_id = joiner.id AND crew.project_id = ${projectId}
        WHERE used.token_hash = ${tokenHash} AND used.used_at = ${now}
          AND crew.role IN ('uploader', 'editor'))`,
    ),
    db.select().from(members).where(isCaller),
    db
      .select({
        usedAt: invites.usedAt,
        revokedAt: invites.revokedAt,
        expiresAt: invites.expiresAt,
        activeProjectId: projects.id,
      })
      .from(invites)
      .leftJoin(projects, and(eq(projects.id, invites.projectId), isNull(projects.deletedAt)))
      .where(eq(invites.tokenHash, tokenHash)),
    db
      .select({ memberId: projectMembers.memberId })
      .from(projectMembers)
      .innerJoin(members, eq(members.id, projectMembers.memberId))
      .where(and(isCaller, eq(projectMembers.projectId, projectId))),
  ]);
  if (marked.meta.changes === 1) return { outcome: "joined", projectId };
  const invite = inviteRows[0];
  if (!invite) return { outcome: "unavailable", reason: "unknown" };
  const reason = unavailableReason(invite, now);
  if (reason) return { outcome: "unavailable", reason };
  if (!invite.activeProjectId) return { outcome: "unavailable", reason: "unknown" };
  const caller = callerRows[0];
  if (caller && caller.removedAt === null && (caller.role === "owner" || assignmentRows.length))
    return { outcome: "already-member", projectId };
  return { outcome: "unavailable", reason: "unknown" };
}
