import { createServerFn } from "@tanstack/react-start";
import { asc, isNull, sql } from "drizzle-orm";
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
        role: members.role,
        createdAt: members.createdAt,
        invitedBy: sql<
          string | null
        >`(SELECT creator.display_name FROM invites i JOIN members creator ON creator.id = i.created_by WHERE i.used_by = members.id ORDER BY i.used_at DESC LIMIT 1)`,
        invitationNote: sql<
          string | null
        >`(SELECT note FROM invites WHERE used_by = members.id ORDER BY used_at DESC LIMIT 1)`,
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
