import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import worker from "@/server";
import { beforeEach, expect, it } from "vitest";
import {
  call,
  clearDatabase,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { callServerFn, resultOf, serverFunctionIds as fn } from "./support/worker";

const FOURTEEN_DAYS_MS = 1_209_600_000;
const owner = "user_owner";
const complete = (caller = owner) => call(fn.completeProject, caller, { projectId: "p" });
const reopen = (caller = owner) => call(fn.reopenProject, caller, { projectId: "p" });
const project = async () =>
  (
    await resultOf<{ project: { completedAt: number | null; deleteAfter: number | null } }>(
      await call(fn.getProject, owner, { projectId: "p" }),
    )
  ).project;
const hourly = async () => {
  const context = createExecutionContext();
  await worker.scheduled(
    createScheduledController({ scheduledTime: Date.now(), cron: "0 * * * *" }),
  );
  await waitOnExecutionContext(context);
};
const projectCount = async () =>
  (await env.DB.prepare("SELECT id FROM projects").all()).results.length;

beforeEach(async () => {
  await clearDatabase();
  for (const role of ["owner", "editor", "viewer"]) await seedMember(role);
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "r", videoId: "v", state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
});

it.each(["user_editor", "user_viewer"])("%s cannot Complete or Reopen", async (caller) => {
  expect((await complete(caller)).status).toBe(403);
  expect((await project()).completedAt).toBeNull();
  expect((await complete()).status).toBe(200);
  expect((await reopen(caller)).status).toBe(403);
  expect((await project()).completedAt).not.toBeNull();
});

it("Complete starts a 14-day countdown and Reopen clears it", async () => {
  expect((await complete()).status).toBe(200);
  const done = await project();
  expect(done.deleteAfter! - done.completedAt!).toBe(FOURTEEN_DAYS_MS);
  expect((await reopen()).status).toBe(200);
  expect(await project()).toMatchObject({ completedAt: null, deleteAfter: null });
});

it("a repeated Complete cannot push the deadline back", async () => {
  await complete();
  await env.DB.exec("UPDATE projects SET delete_after = delete_after - 1000");
  const before = (await project()).deleteAfter;
  expect((await complete()).status).toBe(404);
  expect((await project()).deleteAfter).toBe(before);
});

// Uploads to a Complete Project are refused in uploads.test.ts.
it("Members watch a Complete Project while Comments and Status changes are refused", async () => {
  await complete();
  const review = await resultOf<{ playback: unknown }>(
    await call(fn.getReview, "user_viewer", { videoId: "v" }),
  );
  expect(review.playback).not.toBeNull();
  const comment = {
    id: crypto.randomUUID(),
    videoId: "v",
    revisionId: "r",
    timecodeMs: 1,
    body: "Late note",
  };
  expect((await call(fn.createComment, "user_viewer", comment)).status).toBe(400);
  expect((await call(fn.setVideoStatus, owner, { videoId: "v", status: "done" })).status).toBe(404);
});

it("Share Links answer as unavailable while Complete and return on Reopen", async () => {
  const link = await resultOf<{ token: string }>(
    await call(fn.createShareLink, owner, { videoId: "v", name: "Client", permission: "view" }),
  );
  const guest = () => callServerFn(fn.getGuestReview, { data: { token: link.token } });
  expect((await guest()).status).toBe(200);
  await complete();
  expect((await guest()).status).toBe(404);
  await reopen();
  expect((await guest()).status).toBe(200);
});

it("the hourly purge removes a due Project and leaves a Reopened one", async () => {
  await complete();
  await reopen();
  await hourly();
  expect(await projectCount()).toBe(1);
  await complete();
  await env.DB.exec("UPDATE projects SET delete_after = 1");
  await hourly();
  expect(await projectCount()).toBe(0);
});

it("Reopen is refused once the deadline has passed, even before the purge runs", async () => {
  await complete();
  await env.DB.exec("UPDATE projects SET delete_after = 1");
  expect((await reopen()).status).toBe(404);
  expect((await project()).completedAt).not.toBeNull();
});
