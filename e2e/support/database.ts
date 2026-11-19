import { spawnSync } from "node:child_process";
import {
  comments,
  insertRow,
  insertRowIfMissing,
  members,
  projectMembers,
  projects,
  revisions,
  shareTokenQuery,
  videos,
  type Statement,
} from "../../test/support/rows";

/** Adds a Member to the Seam 2 database, for Roles no screen can create yet. */
export function seedMember(
  clerkUserId: string,
  role: "editor" | "viewer",
  displayName = "Seeded",
  avatarUrl: string | null = null,
) {
  executeSql(
    insertRowIfMissing(members, {
      id: clerkUserId,
      clerkUserId,
      displayName,
      avatarUrl,
      role,
      createdAt: 1,
    }),
  );
}

export function seedReview(clerkUserId: string, ready = true) {
  const id = crypto.randomUUID();
  executeSql(
    insertRow(projects, {
      id,
      name: "Playback project",
      createdBy: clerkUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
    {
      sql: "INSERT INTO project_members (project_id,member_id,role,added_by,created_at) SELECT ?,id,CASE WHEN role = 'viewer' THEN 'viewer' ELSE 'editor' END,id,1 FROM members WHERE id = ?",
      params: [id, clerkUserId],
    },
    insertRow(videos, {
      id,
      projectId: id,
      title: "Playback cut",
      status: "review",
      createdBy: clerkUserId,
      createdAt: 1,
      updatedAt: 1,
    }),
    insertRow(revisions, {
      id,
      videoId: id,
      number: 1,
      state: ready ? "ready" : "processing",
      uploadedBy: clerkUserId,
      muxPlaybackId: "sample",
      durationMs: 8000,
      frameRate: 25,
      createdAt: 1,
    }),
  );
  return id;
}

export function seedComment(
  revisionId: string,
  memberId: string,
  body: string,
  createdAt = 1,
  timecodeMs = 1000,
) {
  const id = crypto.randomUUID();
  executeSql(
    insertRow(comments, {
      id,
      revisionId,
      memberId,
      authorName: "Other reviewer",
      timecodeMs,
      body,
      createdAt,
    }),
  );
  return id;
}

export function removeSeededComment(id: string) {
  executeSql({ sql: "DELETE FROM comments WHERE id = ?", params: [id] });
}

export function seedReadyRevision(videoId: string, memberId: string, number: number) {
  const id = crypto.randomUUID();
  executeSql(
    insertRow(revisions, {
      id,
      videoId,
      number,
      state: "ready",
      uploadedBy: memberId,
      muxPlaybackId: "sample",
      durationMs: 8000,
      frameRate: 25,
      createdAt: 1,
      readyAt: 1,
    }),
  );
  return id;
}

export function shareTokenFor(videoId: string) {
  const output = wrangler("--json", "--command", inlineParams(shareTokenQuery(videoId)));
  return (JSON.parse(output) as { results: { token: string }[] }[])[0]!.results[0]!.token;
}

function executeSql(...statements: Statement[]) {
  wrangler("--command", statements.map(inlineParams).join(";\n"));
}

// wrangler d1 execute takes raw SQL only, so bound parameters become escaped literals here.
function inlineParams({ sql, params }: Statement) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = params[index++];
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
    throw new Error(`Cannot inline SQL parameter ${String(value)}`);
  });
}

function wrangler(...args: string[]) {
  const result = spawnSync(
    "bun",
    [
      "scripts/node.ts",
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      ".wrangler/e2e",
      ...args,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

/** Explicit access for tests that switch identities while reviewing an existing project. */
export function assignProjectMember(
  memberId: string,
  projectId: string,
  role: "editor" | "viewer" = "viewer",
) {
  executeSql({
    sql: "INSERT INTO project_members (project_id, member_id, role, added_by, created_at) SELECT id, ?, ?, created_by, 1 FROM projects WHERE id = ? ON CONFLICT (project_id, member_id) DO UPDATE SET role = excluded.role",
    params: [memberId, role, projectId],
  });
}

/**
 * A Project the Uploader is assigned to, holding two ready Videos:
 * one created by `otherId` and one by the Uploader. Returns the IDs to open.
 */
export function seedUploaderProject(uploaderId: string, otherId: string, suffix: string) {
  const projectId = crypto.randomUUID();
  const videoIds = { others: crypto.randomUUID(), own: crypto.randomUUID() };
  const video = (id: string, title: string, createdBy: string) => [
    insertRow(videos, {
      id,
      projectId,
      title,
      status: "review",
      createdBy,
      createdAt: 1,
      updatedAt: 1,
    }),
    insertRow(revisions, {
      id,
      videoId: id,
      number: 1,
      state: "ready",
      uploadedBy: createdBy,
      muxPlaybackId: "sample",
      durationMs: 8000,
      frameRate: 25,
      createdAt: 1,
      readyAt: 1,
    }),
  ];
  executeSql(
    insertRow(projects, {
      id: projectId,
      name: `Uploader project ${suffix}`,
      createdBy: otherId,
      createdAt: 1,
      updatedAt: 1,
    }),
    insertRow(projectMembers, {
      projectId,
      memberId: uploaderId,
      role: "uploader",
      addedBy: otherId,
      createdAt: 1,
    }),
    ...video(videoIds.others, `Their cut ${suffix}`, otherId),
    ...video(videoIds.own, `My cut ${suffix}`, uploaderId),
  );
  return { projectId, ...videoIds };
}

type SeededRole = "viewer" | "uploader" | "editor";

/** A Project made by the Member with this Clerk user ID, in any Stage, with people assigned. Returns its ID. */
export function seedProject(
  createdByClerkUserId: string,
  name: string,
  stage: "new" | "editing" | "in_review" | "done" = "new",
  people: { memberId: string; role: SeededRole }[] = [],
) {
  const id = crypto.randomUUID();
  executeSql(
    {
      sql: "INSERT INTO projects (id, name, stage, created_by, created_at, updated_at) SELECT ?, ?, ?, id, 1, 1 FROM members WHERE clerk_user_id = ?",
      params: [id, name, stage, createdByClerkUserId],
    },
    ...people.map(({ memberId, role }) => ({
      sql: "INSERT INTO project_members (project_id, member_id, role, added_by, created_at) SELECT ?, ?, ?, id, 1 FROM members WHERE clerk_user_id = ?",
      params: [id, memberId, role, createdByClerkUserId],
    })),
  );
  return id;
}

/** A Video with one ready Revision in a Project. Returns its ID. */
export function seedVideo(projectId: string, title: string, createdBy: string) {
  const id = crypto.randomUUID();
  executeSql(
    insertRow(videos, {
      id,
      projectId,
      title,
      status: "review",
      createdBy,
      createdAt: 1,
      updatedAt: 1,
    }),
    insertRow(revisions, {
      id,
      videoId: id,
      number: 1,
      state: "ready",
      uploadedBy: createdBy,
      muxPlaybackId: "sample",
      durationMs: 8000,
      frameRate: 25,
      createdAt: 1,
      readyAt: 1,
    }),
  );
  return id;
}
