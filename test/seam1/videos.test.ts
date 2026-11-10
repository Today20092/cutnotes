import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMux } from "./support/fake-mux";
import {
  call,
  clearDatabase,
  expectRefused,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { resultOf, serverFunctionIds } from "./support/worker";

const { listProjects, getProject, renameVideo, setVideoStatus } = serverFunctionIds;

type VideoRow = {
  id: string;
  title: string;
  posterUrl: string | null;
  latestRevisionState: string | null;
  latestRevisionError: string | null;
  projectCompletedAt: number | null;
};
type Page = { videos: VideoRow[] };

const video = async () =>
  (await env.DB.prepare("SELECT title, status, updated_at FROM videos WHERE id = 'v1'").first<{
    title: string;
    status: string;
    updated_at: number;
  }>()) as {
    title: string;
    status: string;
    updated_at: number;
  };

async function seedVideoInProject(overrides = {}) {
  const owner = await seedMember("owner");
  await seedProject("p1", overrides);
  await seedVideo("v1", "p1");
  return owner;
}

const firstVideo = async (caller: string) =>
  (await resultOf<Page>(await call(listProjects, caller))).videos[0] as VideoRow;

beforeEach(clearDatabase);
afterEach(() => vi.restoreAllMocks());

describe("grid thumbnails", () => {
  it("signs a poster for the highest ready Revision, with only a token in the URL", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "old" });
    await seedRevision({
      id: "r2",
      videoId: "v1",
      number: 2,
      state: "ready",
      playbackId: "newest",
    });
    await seedRevision({ id: "r3", videoId: "v1", number: 3, state: "processing" });
    const sign = vi.spyOn(fakeMux, "signPlaybackToken");

    const row = await firstVideo(owner);

    expect(row.posterUrl).toBe("https://image.mux.com/newest/thumbnail.webp?token=fake.t.newest");
    expect(sign).toHaveBeenCalledOnce();
    expect(sign.mock.calls[0]?.[0]).toMatchObject({
      playbackId: "newest",
      audience: "t",
    });
  });

  it("gives every Member a poster, including a Viewer", async () => {
    await seedVideoInProject();
    const viewer = await seedMember("viewer");
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });

    expect((await firstVideo(viewer)).posterUrl).toContain("token=fake.t.pb");
  });

  it("includes posters on the Project page", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });

    const page = await resultOf<Page>(await call(getProject, owner, { projectId: "p1" }));

    expect(page.videos[0]?.posterUrl).toContain("token=fake.t.pb");
  });

  it("has no poster before a Revision is ready", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "processing" });

    expect((await firstVideo(owner)).posterUrl).toBeNull();
  });

  it("does not sign for a caller Access refuses", async () => {
    await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });
    const removed = await seedMember("editor", 1000);
    const sign = vi.spyOn(fakeMux, "signPlaybackToken");

    await expectRefused(await call(listProjects, removed), 403, "not-a-member");

    expect(sign).not.toHaveBeenCalled();
  });

  it("keeps one token per Revision across refetches in the same hour", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });
    const sign = vi.spyOn(fakeMux, "signPlaybackToken");

    await firstVideo(owner);
    await firstVideo(owner);

    const [first, second] = sign.mock.calls.map(([request]) => request.expiresAt);
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(Date.now() / 1000 + 3600 - 1);
  });

  it("neither stores nor logs a signed URL", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level),
    );

    await firstVideo(owner);

    const logged = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain("fake.t.pb");
    const stored = await env.DB.prepare("SELECT * FROM revisions").all();
    expect(JSON.stringify(stored.results)).not.toContain("token");
  });
});

describe("processing and failed states", () => {
  it.each(["uploading", "processing", "ready"])(
    "reports the newest Revision as %s",
    async (state) => {
      const owner = await seedVideoInProject();
      await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });
      await seedRevision({ id: "r2", videoId: "v1", number: 2, state });

      expect((await firstVideo(owner)).latestRevisionState).toBe(state);
    },
  );

  it("reports why the newest Revision failed", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "errored" });
    await env.DB.exec("UPDATE revisions SET error_code = 'too-long'");

    expect(await firstVideo(owner)).toMatchObject({
      latestRevisionState: "errored",
      latestRevisionError: "too-long",
    });
  });

  it("says whether the Video's Project is Complete", async () => {
    const owner = await seedVideoInProject({ completedAt: 5 });

    expect((await firstVideo(owner)).projectCompletedAt).toBe(5);
  });

  it("does not send playback IDs to the client beyond the poster URL", async () => {
    const owner = await seedVideoInProject();
    await seedRevision({ id: "r1", videoId: "v1", state: "ready", playbackId: "pb" });

    expect(await firstVideo(owner)).not.toHaveProperty("posterPlaybackId");
  });
});

describe("permission matrix: rename a Video, change Status", () => {
  it.each(["owner", "editor"])("lets a %s do both", async (role) => {
    const owner = await seedVideoInProject();
    const caller = role === "owner" ? owner : await seedMember(role);

    expect((await call(renameVideo, caller, { videoId: "v1", title: "New title" })).status).toBe(
      200,
    );
    expect((await call(setVideoStatus, caller, { videoId: "v1", status: "done" })).status).toBe(
      200,
    );

    expect(await video()).toMatchObject({ title: "New title", status: "done" });
  });

  it("refuses a Viewer who forges either", async () => {
    await seedVideoInProject();
    const viewer = await seedMember("viewer");

    await expectRefused(
      await call(renameVideo, viewer, { videoId: "v1", title: "Nope" }),
      403,
      "insufficient-role",
    );
    await expectRefused(
      await call(setVideoStatus, viewer, { videoId: "v1", status: "done" }),
      403,
      "insufficient-role",
    );
    expect(await video()).toMatchObject({ title: "Video v1", status: "review" });
  });

  it("refuses a removed Editor who forges either", async () => {
    await seedVideoInProject();
    const removed = await seedMember("editor", 1000);

    await expectRefused(
      await call(renameVideo, removed, { videoId: "v1", title: "Nope" }),
      403,
      "not-a-member",
    );
    await expectRefused(
      await call(setVideoStatus, removed, { videoId: "v1", status: "done" }),
      403,
      "not-a-member",
    );
  });
});

describe("renaming a Video and changing Status", () => {
  it("trims the title and updates the Video's last update", async () => {
    const owner = await seedVideoInProject();

    await call(renameVideo, owner, { videoId: "v1", title: "  Tidy  " });

    expect(await video()).toMatchObject({ title: "Tidy" });
    expect((await video()).updated_at).toBeGreaterThan(1);
  });

  it.each([
    ["empty", ""],
    ["over 120 characters", "x".repeat(121)],
    ["not text", 42],
  ])("refuses a title that is %s", async (_label, title) => {
    const owner = await seedVideoInProject();

    await expectRefused(
      await call(renameVideo, owner, { videoId: "v1", title }),
      400,
      "invalid-title",
    );
  });

  it.each(["review", "rework", "done"])("accepts Status %s", async (status) => {
    const owner = await seedVideoInProject();

    await call(setVideoStatus, owner, { videoId: "v1", status });

    expect((await video()).status).toBe(status);
  });

  it.each([["archived"], [""], [7]])("refuses Status %s", async (status) => {
    const owner = await seedVideoInProject();

    await expectRefused(
      await call(setVideoStatus, owner, { videoId: "v1", status }),
      400,
      "invalid-status",
    );
    expect((await video()).status).toBe("review");
  });

  it("changes nothing in a Complete Project", async () => {
    const owner = await seedVideoInProject({ completedAt: 5 });

    await expectRefused(
      await call(renameVideo, owner, { videoId: "v1", title: "Later" }),
      404,
      "not-found",
    );
    await expectRefused(
      await call(setVideoStatus, owner, { videoId: "v1", status: "done" }),
      404,
      "not-found",
    );
    expect(await video()).toMatchObject({ title: "Video v1", status: "review" });
  });

  it("answers not found for an unknown Video", async () => {
    const owner = await seedVideoInProject();

    await expectRefused(
      await call(renameVideo, owner, { videoId: "missing", title: "x" }),
      404,
      "not-found",
    );
  });

  it("answers not found for a deleted Video", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1", 5);

    await expectRefused(
      await call(setVideoStatus, owner, { videoId: "v1", status: "done" }),
      404,
      "not-found",
    );
  });
});
