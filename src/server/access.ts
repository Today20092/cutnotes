import { auth } from "@clerk/tanstack-react-start/server";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb, type Db } from "@/server/db";
import { members, roles, type Member, type Role } from "@/server/db/schema";

export type RefusalCode = "signed-out" | "not-a-member" | "insufficient-role";

type BatchResults<Reads extends readonly unknown[]> = {
  -readonly [Index in keyof Reads]: Awaited<Reads[Index]>;
};

function refuse(status: 401 | 403, code: RefusalCode): never {
  throw Response.json({ code }, { status });
}

/** Who is calling, and whether they hold at least `minimumRole`. Refuses by throwing a Response. */
export async function requireMember(minimumRole: Role): Promise<Member> {
  const { member } = await readAsMember(minimumRole, () => []);
  return member;
}

/**
 * `requireMember` for a screen: the caller's Member row and the screen's reads
 * travel in one D1 batch. The reads are discarded if the caller is refused.
 */
export async function readAsMember<const Reads extends readonly BatchItem<"sqlite">[]>(
  minimumRole: Role,
  reads: (db: Db) => Reads,
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

async function readBatch<const Reads extends readonly BatchItem<"sqlite">[]>(
  clerkUserId: string,
  reads: (db: Db) => Reads,
): Promise<[Member | undefined, BatchResults<Reads>]> {
  const db = getDb();
  const [memberRows, ...results] = (await db.batch([
    db.select().from(members).where(eq(members.clerkUserId, clerkUserId)),
    ...reads(db),
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
