import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  activeMember,
  folderAccess,
  folderRole,
  id,
  memberIdForUser,
  parse,
  projectAccess,
  projectRole,
  readAsMember,
  refuse,
  requireMember,
  text,
} from "@/server/access";
import { getDb } from "@/server/db";
import {
  folderMembers,
  folders,
  members,
  projectRoles,
  projects,
  type ProjectRole,
} from "@/server/db/schema";
import { projectSummary } from "@/server/projects";

const MAX_NAME_LENGTH = 120;

const folderSummary = {
  id: folders.id,
  name: folders.name,
  createdAt: folders.createdAt,
  updatedAt: folders.updatedAt,
};

/** A Folder and the Projects in it. Folder members can open every Project inside. */
export const getFolder = createServerFn({ method: "POST" })
  .validator((data: { folderId: string }) => data)
  .handler(async ({ data }) => {
    const { member, results } = await readAsMember("viewer", (db, clerkUserId) => {
      // Reads run before the Access check, so bad input must not refuse here.
      const folderId = typeof data?.folderId === "string" ? data.folderId : "";
      const caller = memberIdForUser(clerkUserId);
      return [
        db
          .select({ ...folderSummary, role: folderRole(caller, folders.id).as("folder_role") })
          .from(folders)
          .where(and(eq(folders.id, folderId), folderAccess(caller, folders.id))),
        db
          .select({ ...projectSummary, role: projectRole(caller, projects.id) })
          .from(projects)
          .where(
            and(
              eq(projects.folderId, folderId),
              folderAccess(caller, projects.folderId),
              projectAccess(caller, projects.id),
            ),
          )
          .orderBy(desc(projects.createdAt)),
      ] as const;
    });
    const [folder] = results[0];
    if (!folder) refuse(404, "not-found");
    return {
      member: { id: member.id, displayName: member.displayName, role: member.role },
      folder,
      projects: results[1],
    };
  });

export const createFolder = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const name = text(data, "name", MAX_NAME_LENGTH, "invalid-name");
    const now = Date.now();
    const [folder] = await getDb()
      .insert(folders)
      .select(
        sql`SELECT ${crypto.randomUUID()}, ${name}, ${owner.id}, ${now}, ${now}
          WHERE ${activeMember(owner.id, "owner")}`,
      )
      .returning(folderSummary);
    if (!folder) refuse(403, "insufficient-role");
    return folder;
  });

export const renameFolder = createServerFn({ method: "POST" })
  .validator((data: { folderId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const [folder] = await getDb()
      .update(folders)
      .set({ name: text(data, "name", MAX_NAME_LENGTH, "invalid-name"), updatedAt: Date.now() })
      .where(and(eq(folders.id, id(data, "folderId")), activeMember(owner.id, "owner")))
      .returning(folderSummary);
    if (!folder) refuse(404, "not-found");
    return folder;
  });

/**
 * Deletes the Folder row. Its Projects become unfiled, and its assignments and
 * Invites go with it, so access held only through the Folder ends.
 */
export const deleteFolder = createServerFn({ method: "POST" })
  .validator((data: { folderId: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const [folder] = await getDb()
      .delete(folders)
      .where(and(eq(folders.id, id(data, "folderId")), activeMember(owner.id, "owner")))
      .returning({ id: folders.id });
    if (!folder) refuse(404, "not-found");
    return folder;
  });

export const listFolderMembers = createServerFn({ method: "POST" })
  .validator((data: { folderId: string }) => data)
  .handler(async ({ data }) => {
    const folderId = typeof data?.folderId === "string" ? data.folderId : "";
    const {
      results: [folder, people],
    } = await readAsMember("owner", (db) => [
      db.select(folderSummary).from(folders).where(eq(folders.id, folderId)),
      db
        .select({
          id: members.id,
          displayName: members.displayName,
          teamRole: sql<typeof members.$inferSelect.role>`${members.role}`.as("team_role"),
          role: sql<ProjectRole | null>`${folderMembers.role}`.as("folder_role"),
          addedAt: folderMembers.createdAt,
          addedBy: sql<
            string | null
          >`(SELECT display_name FROM members AS inviter WHERE inviter.id = ${folderMembers.addedBy})`,
        })
        .from(members)
        .leftJoin(
          folderMembers,
          and(eq(folderMembers.memberId, members.id), eq(folderMembers.folderId, folderId)),
        )
        .where(isNull(members.removedAt))
        .orderBy(asc(members.createdAt), asc(members.id)),
    ]);
    if (!folder[0]) refuse(404, "not-found");
    return { folder: folder[0], members: people };
  });

const assignmentSchema = v.object({
  folderId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  memberId: v.pipe(v.string(), v.nonEmpty(), v.maxLength(128)),
  role: v.picklist(projectRoles),
});

export const setFolderMember = createServerFn({ method: "POST" })
  .validator((data: { folderId: string; memberId: string; role: ProjectRole }) => data)
  .handler(async ({ data: raw }) => {
    const owner = await requireMember("owner");
    const data = parse(assignmentSchema, raw);
    const now = Date.now();
    const [assigned] = await getDb()
      .insert(folderMembers)
      .select(sql`SELECT ${data.folderId}, ${data.memberId}, ${data.role}, ${owner.id}, ${now}
        WHERE ${activeMember(owner.id, "owner")}
          AND EXISTS (SELECT 1 FROM folders WHERE id = ${data.folderId})
          AND EXISTS (SELECT 1 FROM members WHERE id = ${data.memberId} AND removed_at IS NULL AND role <> 'owner')`)
      .onConflictDoUpdate({
        target: [folderMembers.folderId, folderMembers.memberId],
        set: { role: data.role },
      })
      .returning({ id: folderMembers.memberId });
    if (!assigned) refuse(404, "not-found");
    return null;
  });

export const removeFolderMember = createServerFn({ method: "POST" })
  .validator((data: { folderId: string; memberId: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const folderId = id(data, "folderId");
    const memberId = id(data, "memberId");
    const [removed] = await getDb()
      .delete(folderMembers)
      .where(
        and(
          eq(folderMembers.folderId, folderId),
          eq(folderMembers.memberId, memberId),
          activeMember(owner.id, "owner"),
        ),
      )
      .returning({ id: folderMembers.memberId });
    if (!removed) refuse(404, "not-found");
    return null;
  });
