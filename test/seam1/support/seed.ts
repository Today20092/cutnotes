import { env } from "cloudflare:workers";
import { expect } from "vitest";
import {
  insertRow,
  members,
  projects,
  revisions,
  videos,
  type RevisionState,
  type Role,
  type Statement,
} from "../../support/rows";
import { sessionToken } from "./clerk";
import { callServerFn } from "./worker";

const run = ({ sql, params }: Statement) =>
  env.DB.prepare(sql)
    .bind(...params)
    .run();

export async function seedMember(role: string, removedAt: number | null = null) {
  await run(
    insertRow(members, {
      id: `member_${role}`,
      clerkUserId: `user_${role}`,
      displayName: role,
      // Tests pass Roles from loops typed as string.
      role: role as Role,
      createdAt: 1,
      removedAt,
    }),
  );
  await assignFixtureCrew();
  return `user_${role}`;
}

export async function seedProject(
  id: string,
  overrides: { deletedAt?: number; completedAt?: number } = {},
) {
  await run(
    insertRow(projects, {
      id,
      name: `Project ${id}`,
      createdBy: "member_owner",
      createdAt: 1,
      updatedAt: 1,
      completedAt: overrides.completedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    }),
  );
  await assignFixtureCrew();
}

/** These legacy business fixtures explicitly share work with their seeded crew. */
async function assignFixtureCrew() {
  await env.DB.prepare(`INSERT OR IGNORE INTO project_members (project_id, member_id, role, added_by, created_at)
    SELECT p.id, m.id, CASE WHEN m.role = 'editor' THEN 'editor' ELSE 'viewer' END, p.created_by, 1
    FROM projects p CROSS JOIN members m WHERE m.removed_at IS NULL AND m.role <> 'owner'`).run();
}

export async function seedVideo(id: string, projectId: string, deletedAt: number | null = null) {
  await run(
    insertRow(videos, {
      id,
      projectId,
      title: `Video ${id}`,
      status: "review",
      createdBy: "member_owner",
      createdAt: 1,
      updatedAt: 1,
      deletedAt,
    }),
  );
}

export type RevisionSeed = {
  id: string;
  videoId: string;
  number?: number;
  state?: string;
  uploadId?: string | null;
  assetId?: string | null;
  playbackId?: string | null;
};

export async function seedRevision(seed: RevisionSeed) {
  await run(
    insertRow(revisions, {
      id: seed.id,
      videoId: seed.videoId,
      number: seed.number ?? 1,
      state: (seed.state ?? "uploading") as RevisionState,
      uploadedBy: "member_owner",
      muxUploadId: seed.uploadId ?? null,
      muxAssetId: seed.assetId ?? null,
      muxPlaybackId: seed.playbackId ?? null,
      createdAt: 1,
    }),
  );
}

export const call = async (id: string, clerkUserId: string, data?: unknown) =>
  callServerFn(id, { bearer: await sessionToken({ clerkUserId }), data });

export async function expectRefused(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
}

export async function clearDatabase() {
  await env.DB.exec("DELETE FROM projects");
  await env.DB.exec("DELETE FROM members");
}
