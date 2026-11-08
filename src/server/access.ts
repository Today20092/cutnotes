import { auth } from "@clerk/tanstack-react-start/server";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { members, roles, type Member, type Role } from "@/server/db/schema";

export type RefusalCode =
  | "signed-out"
  | "not-a-member"
  | "insufficient-role"
  | "invalid-request";

export function refuse(status: 400 | 401 | 403, code: RefusalCode): never {
  throw Response.json({ code }, { status });
}

/** Who is calling, and whether they hold at least `minimumRole`. Refuses by throwing a Response. */
export async function requireMember(minimumRole: Role): Promise<Member> {
  const { userId, sessionClaims } = await auth();
  if (!userId) refuse(401, "signed-out");

  const member = await findMember(userId) ?? await claimFirstOwner(userId, sessionClaims);
  if (!member || member.removedAt !== null) refuse(403, "not-a-member");
  if (roles.indexOf(member.role) < roles.indexOf(minimumRole)) {
    refuse(403, "insufficient-role");
  }
  return member;
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

async function findMember(clerkUserId: string) {
  return getDb().query.members.findFirst({
    where: eq(members.clerkUserId, clerkUserId),
  });
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
