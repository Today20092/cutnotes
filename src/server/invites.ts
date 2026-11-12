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
import { invites, members, roles, type Role } from "@/server/db/schema";

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

/** Reading a preview must never redeem the Invite. */
export const getInvitePreview = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (typeof data?.token !== "string" || !/^[\w-]{43}$/.test(data.token)) return null;
    const [invite] = await getDb()
      .select({ role: invites.role })
      .from(invites)
      .where(and(eq(invites.tokenHash, await sha256(data.token)), isPending(Date.now())));
    if (!invite) return null;
    return {
      title: `You're invited to join ${env.TEAM_NAME}`,
      description: `Join ${env.TEAM_NAME} as ${invite.role === "owner" ? "an" : "a"} ${invite.role} on Cutnotes. Sign in to accept. This invitation works once and expires after 7 days.`,
      image: env.TEAM_LOGO_URL,
    };
  });

const pendingFields = {
  id: invites.id,
  role: invites.role,
  createdAt: invites.createdAt,
  expiresAt: invites.expiresAt,
};

export type PendingInvite = {
  id: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
};

/** The token exists only in this response. Afterwards the server holds just its hash. */
export const createInvite = createServerFn({ method: "POST" })
  .validator((data: { role: Role }) => data)
  .handler(async ({ data }): Promise<{ url: string; invite: PendingInvite }> => {
    const owner = await requireMember("owner");
    const role = roles.find((known) => known === (data as { role?: unknown } | undefined)?.role);
    if (!role) refuse(400, "invalid-request");

    const token = newToken();
    const now = Date.now();
    const invite = {
      id: crypto.randomUUID(),
      role,
      createdAt: now,
      expiresAt: now + inviteLifetimeMs,
    };
    const [created] = await getDb()
      .insert(invites)
      .select(sql`SELECT ${invite.id}, ${await sha256(token)}, ${role}, ${owner.id}, ${now}, ${invite.expiresAt}, NULL, NULL, NULL
        WHERE ${activeMember(owner.id, "owner")}`)
      .returning({ id: invites.id });
    if (!created) refuse(403, "insufficient-role");
    return { url: `${env.APP_ORIGIN}/invite/${token}`, invite };
  });

export const listInvites = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ invites: PendingInvite[] }> => {
    const { results } = await readAsMember("owner", (db) => [
      db
        .select(pendingFields)
        .from(invites)
        .where(isPending(Date.now()))
        .orderBy(desc(invites.createdAt)),
    ]);
    return { invites: results[0] };
  },
);

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
  | { outcome: "joined" }
  | { outcome: "already-member" }
  | { outcome: "unavailable"; reason: "used" | "expired" | "revoked" | "unknown" };

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
      sql`SELECT ${newMemberId}, ${person.clerkUserId}, ${person.displayName}, ${invites.role}, ${now}, NULL
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
  const caller = callerRows[0];
  if (caller && caller.removedAt === null) return { outcome: "already-member" };

  const invite = inviteRows[0];
  if (!invite) return { outcome: "unavailable", reason: "unknown" };
  if (invite.revokedAt !== null) return { outcome: "unavailable", reason: "revoked" };
  if (invite.usedAt !== null) return { outcome: "unavailable", reason: "used" };
  return { outcome: "unavailable", reason: "expired" };
}

/** Not Member-gated: this is how a signed-in person becomes a Member. */
export const redeemInvite = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<RedeemResult> => {
    const person = await requireSignedIn();
    return redeem(person, await sha256(id(data, "token")));
  });
