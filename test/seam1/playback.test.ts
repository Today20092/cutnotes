import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeMux } from "./support/fake-mux";
import {
  call,
  clearDatabase,
  seedMember,
  seedProject,
  seedVideo,
  seedRevision,
  expectRefused,
} from "./support/seed";
import { resultOf, serverFunctionIds } from "./support/worker";

beforeEach(clearDatabase);
afterEach(() => vi.restoreAllMocks());

it.each([
  [60, 3600],
  [2700, 3600],
  [7200, 8100],
])(
  "opens the highest ready Revision and signs separate scoped tokens for %s seconds",
  async (duration, lifetime) => {
    const owner = await seedMember("owner");
    await seedProject("p");
    await seedVideo("v", "p");
    await seedRevision({ id: "r1", videoId: "v", state: "ready", playbackId: "old" });
    await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "latest" });
    await seedRevision({ id: "r3", videoId: "v", number: 3, state: "processing" });
    await env.DB.prepare("UPDATE revisions SET duration_ms = ? WHERE id = 'r2'")
      .bind(duration * 1000)
      .run();
    const sign = vi.spyOn(fakeMux, "signPlaybackToken");
    const batch = vi.spyOn(env.DB, "batch");
    const now = Math.floor(Date.now() / 1000);
    const response = await call(serverFunctionIds.getReview, owner, { videoId: "v" });
    expect(response.status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(await resultOf(response)).toMatchObject({
      video: { id: "v", title: "Video v", projectId: "p", projectName: "Project p" },
      revision: { id: "r2", number: 2 },
      playback: {
        videoUrl: "https://stream.mux.com/latest.m3u8?token=fake.v.latest",
        posterUrl: "https://image.mux.com/latest/thumbnail.webp?token=fake.t.latest",
        storyboardUrl: "https://image.mux.com/latest/storyboard.json?token=fake.s.latest",
      },
    });
    expect(sign.mock.calls.map(([request]) => request.audience).sort()).toEqual(["s", "t", "v"]);
    for (const [request] of sign.mock.calls) {
      expect(request.expiresAt).toBeGreaterThanOrEqual(now + lifetime);
      expect(request.expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + lifetime);
      if (request.audience === "v") expect(request.claims).toEqual({ max_resolution: "1080p" });
    }
  },
);

it.each(["owner", "editor", "viewer"])(
  "lets a %s watch a Complete Project and renew the same Revision",
  async (role) => {
    const owner = await seedMember("owner");
    const caller = role === "owner" ? owner : await seedMember(role);
    await seedProject("p", { completedAt: 1 });
    await seedVideo("v", "p");
    await seedRevision({ id: "older", videoId: "v", state: "ready", playbackId: "older" });
    await seedRevision({
      id: "newer",
      videoId: "v",
      number: 2,
      state: "ready",
      playbackId: "newer",
    });
    await env.DB.prepare("UPDATE revisions SET duration_ms = 60000").run();
    const response = await call(serverFunctionIds.getReview, caller, {
      videoId: "v",
      revisionId: "older",
    });
    expect(response.status).toBe(200);
    expect(await resultOf(response)).toMatchObject({
      revision: { id: "older" },
      playback: { videoUrl: "https://stream.mux.com/older.m3u8?token=fake.v.older" },
    });
    await expectRefused(
      await call(serverFunctionIds.getReview, caller, { videoId: "v", revisionId: "unknown" }),
      404,
      "not-found",
    );
  },
);

it("keeps an unready Video available without issuing credentials", async () => {
  const owner = await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  const sign = vi.spyOn(fakeMux, "signPlaybackToken");
  expect(
    await resultOf(await call(serverFunctionIds.getReview, owner, { videoId: "v" })),
  ).toMatchObject({ revision: null, playback: null });
  expect(sign).not.toHaveBeenCalled();
});

it("never signs for a removed Member or deleted Video", async () => {
  await seedMember("owner");
  const removed = await seedMember("viewer", 1);
  await seedProject("p");
  await seedVideo("v", "p", 1);
  const sign = vi.spyOn(fakeMux, "signPlaybackToken");
  await expectRefused(
    await call(serverFunctionIds.getReview, removed, { videoId: "v" }),
    403,
    "not-a-member",
  );
  expect(
    await resultOf(await call(serverFunctionIds.getReview, "user_owner", { videoId: "v" })),
  ).toMatchObject({ member: { role: "owner" }, video: null, playback: null });
  expect(sign).not.toHaveBeenCalled();
});
