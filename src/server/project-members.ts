import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import * as v from "valibot";
import { activeMember, id, parse, readAsMember, refuse, requireMember } from "@/server/access";
import { getDb } from "@/server/db";
import {
  members,
  projectMembers,
  projectRoles,
  projects,
  type ProjectRole,
} from "@/server/db/schema";

export const listProjectMembers = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const projectId = typeof data?.projectId === "string" ? data.projectId : "";
    const {
      results: [project, people],
    } = await readAsMember("owner", (db) => [
      db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))),
      db
        .select({
          id: members.id,
          displayName: members.displayName,
          teamRole: sql<typeof members.$inferSelect.role>`${members.role}`.as("team_role"),
          role: sql<ProjectRole | null>`${projectMembers.role}`.as("project_role"),
          addedAt: projectMembers.createdAt,
          addedBy: sql<
            string | null
          >`(SELECT display_name FROM members AS inviter WHERE inviter.id = ${projectMembers.addedBy})`,
        })
        .from(members)
        .leftJoin(
          projectMembers,
          and(eq(projectMembers.memberId, members.id), eq(projectMembers.projectId, projectId)),
        )
        .where(isNull(members.removedAt))
        .orderBy(asc(members.createdAt), asc(members.id)),
    ]);
    if (!project.length) refuse(404, "not-found");
    return { members: people };
  });

const assignmentSchema = v.object({
  projectId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  memberId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  role: v.picklist(projectRoles),
});

export const setProjectMember = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; memberId: string; role: ProjectRole }) => data)
  .handler(async ({ data: raw }) => {
    const owner = await requireMember("owner");
    const data = parse(assignmentSchema, raw);
    const now = Date.now();
    const [assigned] = await getDb()
      .insert(projectMembers)
      .select(sql`SELECT ${data.projectId}, ${data.memberId}, ${data.role}, ${owner.id}, ${now}
        WHERE ${activeMember(owner.id, "owner")}
          AND EXISTS (SELECT 1 FROM projects WHERE id = ${data.projectId} AND deleted_at IS NULL)
          AND EXISTS (SELECT 1 FROM members WHERE id = ${data.memberId} AND removed_at IS NULL AND role <> 'owner')`)
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.memberId],
        set: { role: data.role },
      })
      .returning({ id: projectMembers.memberId });
    if (!assigned) refuse(404, "not-found");
    return null;
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; memberId: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const projectId = id(data, "projectId");
    const memberId = id(data, "memberId");
    const [removed] = await getDb()
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.memberId, memberId),
          activeMember(owner.id, "owner"),
          sql`EXISTS (SELECT 1 FROM projects WHERE id = ${projectId} AND deleted_at IS NULL)`,
          sql`EXISTS (SELECT 1 FROM members WHERE id = ${memberId} AND role <> 'owner')`,
        ),
      )
      .returning({ id: projectMembers.memberId });
    if (!removed) refuse(404, "not-found");
    return null;
  });
