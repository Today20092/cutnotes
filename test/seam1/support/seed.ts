import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { sessionToken } from "./clerk";
import { callServerFn } from "./worker";

export async function seedMember(role: string, removedAt: number | null = null) {
  await env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES (?, ?, ?, ?, 1, ?)",
  )
    .bind(`member_${role}`, `user_${role}`, role, role, removedAt)
    .run();
  return `user_${role}`;
}

export async function seedProject(
  id: string,
  overrides: { deletedAt?: number; completedAt?: number } = {},
) {
  await env.DB.prepare(
    "INSERT INTO projects (id, name, created_by, created_at, updated_at, completed_at, deleted_at) VALUES (?, ?, 'member_owner', 1, 1, ?, ?)",
  )
    .bind(
      id,
      `Project ${id}`,
      overrides.completedAt ?? null,
      overrides.deletedAt ?? null,
    )
    .run();
}

export async function seedVideo(
  id: string,
  projectId: string,
  deletedAt: number | null = null,
) {
  await env.DB.prepare(
    "INSERT INTO videos (id, project_id, title, status, created_by, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 'review', 'member_owner', 1, 1, ?)",
  )
    .bind(id, projectId, `Video ${id}`, deletedAt)
    .run();
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
  await env.DB.prepare(
    "INSERT INTO revisions (id, video_id, number, state, uploaded_by, mux_upload_id, mux_asset_id, mux_playback_id, created_at) VALUES (?, ?, ?, ?, 'member_owner', ?, ?, ?, 1)",
  )
    .bind(
      seed.id,
      seed.videoId,
      seed.number ?? 1,
      seed.state ?? "uploading",
      seed.uploadId ?? null,
      seed.assetId ?? null,
      seed.playbackId ?? null,
    )
    .run();
}

export const call = async (id: string, clerkUserId: string, data?: unknown) =>
  callServerFn(id, { bearer: await sessionToken({ clerkUserId }), data });

export async function expectRefused(
  response: Response,
  status: number,
  code: string,
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
}

export async function clearDatabase() {
  await env.DB.exec("DELETE FROM projects");
  await env.DB.exec("DELETE FROM members");
}
