import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { readAsMember, requireMember } from "@/server/access";
import { getDb, type Db } from "@/server/db";
import { projects, videos } from "@/server/db/schema";

const MAX_NAME_LENGTH = 120;

function reject(status: 400 | 404, code: "invalid-name" | "not-found"): never {
  throw Response.json({ code }, { status });
}

// Input is checked in the handlers, not an input validator, so Access always runs first.
function parseName(data: unknown) {
  const raw = (data as { name?: unknown } | undefined)?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) reject(400, "invalid-name");
  return name;
}

function parseProjectId(data: unknown) {
  const raw = (data as { projectId?: unknown } | undefined)?.projectId;
  return typeof raw === "string" ? raw : "";
}

const projectSummary = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  completedAt: projects.completedAt,
};

const selectVideos = (db: Db) =>
  db
    .select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      updatedAt: videos.updatedAt,
      projectId: videos.projectId,
      projectName: projects.name,
      latestRevision: sql<number | null>`(SELECT max(number) FROM revisions WHERE revisions.video_id = ${videos.id})`,
    })
    .from(videos)
    .innerJoin(projects, eq(videos.projectId, projects.id));

const liveVideo = and(isNull(videos.deletedAt), isNull(projects.deletedAt));

export const listProjects = createServerFn({ method: "POST" }).handler(
  async () => {
    const { member, results } = await readAsMember("viewer", (db) => [
      db
        .select(projectSummary)
        .from(projects)
        .where(isNull(projects.deletedAt))
        .orderBy(desc(projects.createdAt)),
      selectVideos(db).where(liveVideo).orderBy(desc(videos.updatedAt)),
    ]);
    return {
      member: { displayName: member.displayName, role: member.role },
      projects: results[0],
      videos: results[1],
    };
  },
);

export const getProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string }) => data)
  .handler(async ({ data }) => {
    const projectId = parseProjectId(data);
    const { member, results } = await readAsMember("viewer", (db) => [
      db
        .select(projectSummary)
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))),
      selectVideos(db)
        .where(and(eq(videos.projectId, projectId), liveVideo))
        .orderBy(desc(videos.updatedAt)),
    ]);
    const [project] = results[0];
    if (!project) reject(404, "not-found");
    return {
      member: { displayName: member.displayName, role: member.role },
      project,
      videos: results[1],
    };
  });

export const createProject = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const now = Date.now();
    const [project] = await getDb()
      .insert(projects)
      .values({
        id: crypto.randomUUID(),
        name: parseName(data),
        createdBy: member.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning(projectSummary);
    return project;
  });

export const renameProject = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; name: string }) => data)
  .handler(async ({ data }) => {
    await requireMember("editor");
    const [project] = await getDb()
      .update(projects)
      .set({ name: parseName(data), updatedAt: Date.now() })
      .where(
        and(
          eq(projects.id, parseProjectId(data)),
          isNull(projects.deletedAt),
          // A Complete Project is read-only until it is reopened.
          isNull(projects.completedAt),
        ),
      )
      .returning(projectSummary);
    if (!project) reject(404, "not-found");
    return project;
  });
