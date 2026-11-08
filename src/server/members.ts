import { createServerFn } from "@tanstack/react-start";
import { asc, isNull } from "drizzle-orm";
import {
  readAsMember,
  refuse,
  removeActiveMember,
  requireMember,
  setMemberRole,
} from "@/server/access";
import { members, roles, type Role } from "@/server/db/schema";

// Input is checked in the handlers, not an input validator, so Access always runs first.
function parseMemberId(data: unknown) {
  const id = (data as { id?: unknown } | undefined)?.id;
  if (typeof id !== "string") refuse(400, "invalid-request");
  return id;
}

export const listMembers = createServerFn({ method: "POST" }).handler(
  async () => {
    const { member, results } = await readAsMember("owner", (db) => [
      db
        .select({
          id: members.id,
          displayName: members.displayName,
          role: members.role,
          createdAt: members.createdAt,
        })
        .from(members)
        .where(isNull(members.removedAt))
        .orderBy(asc(members.createdAt), asc(members.id)),
    ]);
    return { youId: member.id, members: results[0] };
  },
);

export const changeMemberRole = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: Role }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const id = parseMemberId(data);
    const role = roles.find(
      (known) => known === (data as { role?: unknown } | undefined)?.role,
    );
    if (!role) refuse(400, "invalid-request");

    await setMemberRole(owner, id, role);
    return null;
  });

export const removeMember = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    await removeActiveMember(owner, parseMemberId(data));
    return null;
  });
