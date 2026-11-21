import { createServerFn } from "@tanstack/react-start";
import { readAsMember } from "@/server/access";
import { and, eq, isNull } from "drizzle-orm";
import { readClerkProfile } from "@/server/clerk-profile";
import { getDb } from "@/server/db";
import { members } from "@/server/db/schema";

export const getAppShell = createServerFn({ method: "POST" }).handler(async () => {
  const { member } = await readAsMember("viewer", () => []);
  let profile = { displayName: member.displayName, avatarUrl: member.avatarUrl };
  try {
    const current = await readClerkProfile(member.clerkUserId);
    if (current) {
      const next = { ...current, displayName: current.displayName || member.displayName };
      if (next.displayName !== member.displayName || next.avatarUrl !== member.avatarUrl) {
        await getDb()
          .update(members)
          .set(next)
          .where(and(eq(members.id, member.id), isNull(members.removedAt)));
      }
      profile = next;
    }
  } catch {
    // A profile-service outage must not prevent reviews using the cached profile.
    console.warn("Could not refresh the Clerk profile");
  }
  return { member: { ...profile, role: member.role } };
});
