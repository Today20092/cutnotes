import { createServerFn } from "@tanstack/react-start";
import { asc, isNull } from "drizzle-orm";
import {
  id,
  readAsMember,
  refuse,
  removeActiveMember,
  requireMember,
  setMemberRole,
} from "@/server/access";
import { members, roles, type Role } from "@/server/db/schema";

export const listMembers = createServerFn({ method: "POST" }).handler(async () => {
  const { member, results } = await readAsMember("owner", (db) => [
    db
      .select({
        id: members.id,
        displayName: members.displayName,
        avatarUrl: members.avatarUrl,
        role: members.role,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(isNull(members.removedAt))
      .orderBy(asc(members.createdAt), asc(members.id)),
  ]);
  return { youId: member.id, members: results[0] };
});

export const changeMemberRole = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: Role }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const memberId = id(data, "id");
    const role = roles.find((known) => known === (data as { role?: unknown } | undefined)?.role);
    if (!role) refuse(400, "invalid-request");

    await setMemberRole(owner, memberId, role);
    return null;
  });

export const removeMember = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    await removeActiveMember(owner, id(data, "id"));
    return null;
  });
