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

const { startUpload, cancelUpload } = serverFunctionIds;

type Started = { videoId: string; revisionId: string; uploadUrl: string };

const revisions = async () =>
  (
    await env.DB.prepare(
      "SELECT id, video_id, number, state, uploaded_by, mux_upload_id FROM revisions ORDER BY video_id, number",
    ).all<{
      id: string;
      video_id: string;
      number: number;
      state: string;
      uploaded_by: string;
      mux_upload_id: string | null;
    }>()
  ).results;

const videoTitles = async () =>
  (
    await env.DB.prepare("SELECT title, status FROM videos ORDER BY title").all<{
      title: string;
      status: string;
    }>()
  ).results;

const newVideo = { projectId: "p1", title: "Main cut" };

beforeEach(clearDatabase);
afterEach(() => vi.restoreAllMocks());

describe("permission matrix: create a Video or upload a Revision", () => {
  it.each(["owner", "editor"])("lets a %s start an upload", async (role) => {
    const owner = await seedMember("owner");
    const caller = role === "owner" ? owner : await seedMember(role);
    await seedProject("p1");

    const response = await call(startUpload, caller, newVideo);

    expect(response.status).toBe(200);
    expect(await revisions()).toMatchObject([
      { number: 1, state: "uploading", uploaded_by: `member_${role}` },
    ]);
  });

  it("refuses a Viewer before creating anything or calling Mux", async () => {
    await seedMember("owner");
    const viewer = await seedMember("viewer");
    await seedProject("p1");
    const create = vi.spyOn(fakeMux, "createDirectUpload");

    await expectRefused(await call(startUpload, viewer, newVideo), 404, "not-found");

    expect(await revisions()).toEqual([]);
    expect(await videoTitles()).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a removed Editor", async () => {
    await seedMember("owner");
    const editor = await seedMember("editor", 1000);
    await seedProject("p1");

    await expectRefused(await call(startUpload, editor, newVideo), 403, "not-a-member");
  });

  it("refuses a Viewer who forges a cancel", async () => {
    await seedMember("owner");
    const viewer = await seedMember("viewer");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    await seedRevision({ id: "r1", videoId: "v1", uploadId: "u1" });

    await expectRefused(await call(cancelUpload, viewer, { revisionId: "r1" }), 404, "not-found");
    expect(await revisions()).toHaveLength(1);
  });
});

describe("starting an upload", () => {
  it("creates the Video in Review with a Revision tied to its Mux upload", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    const create = vi.spyOn(fakeMux, "createDirectUpload");

    const started = await resultOf<Started>(
      await call(startUpload, owner, { projectId: "p1", title: "  Main cut  " }),
    );

    expect(create).toHaveBeenCalledExactlyOnceWith({
      corsOrigin: env.APP_ORIGIN,
      passthrough: started.revisionId,
    });
    expect(started.uploadUrl).toBe(`https://uploads.mux.test/${started.revisionId}`);
    expect(await videoTitles()).toEqual([{ title: "Main cut", status: "review" }]);
    expect(await revisions()).toMatchObject([
      {
        id: started.revisionId,
        video_id: started.videoId,
        number: 1,
        mux_upload_id: `upload_${started.revisionId}`,
      },
    ]);
  });

  it("does not store the upload URL", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");

    const started = await resultOf<Started>(await call(startUpload, owner, newVideo));

    const rows = await env.DB.prepare("SELECT * FROM revisions").all();
    expect(JSON.stringify(rows.results)).not.toContain(started.uploadUrl);
  });

  it("gives a retry on an existing Video the next number and keeps its Status", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    await env.DB.exec("UPDATE videos SET status = 'rework' WHERE id = 'v1'");
    await seedRevision({ id: "r1", videoId: "v1", state: "errored" });

    const response = await call(startUpload, owner, { videoId: "v1" });

    expect(response.status).toBe(200);
    expect((await revisions()).map((row) => row.number)).toEqual([1, 2]);
    expect(await videoTitles()).toEqual([{ title: "Video v1", status: "rework" }]);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["over 120 characters", "x".repeat(121)],
    ["not text", 42],
  ])("refuses a title that is %s", async (_label, title) => {
    const owner = await seedMember("owner");
    await seedProject("p1");

    await expectRefused(
      await call(startUpload, owner, { projectId: "p1", title }),
      400,
      "invalid-title",
    );
    expect(await videoTitles()).toEqual([]);
  });

  it.each([
    ["unknown", "missing", {}],
    ["deleted", "p1", { deletedAt: 5 }],
    ["Complete", "p1", { completedAt: 5 }],
  ])("refuses a new Video in a %s Project", async (_label, projectId, overrides) => {
    const owner = await seedMember("owner");
    await seedProject("p1", overrides);
    const create = vi.spyOn(fakeMux, "createDirectUpload");

    await expectRefused(
      await call(startUpload, owner, { projectId, title: "Cut" }),
      404,
      "not-found",
    );
    expect(await videoTitles()).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a Revision of a Video in a Complete Project", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1", { completedAt: 5 });
    await seedVideo("v1", "p1");

    await expectRefused(await call(startUpload, owner, { videoId: "v1" }), 404, "not-found");
    expect(await revisions()).toEqual([]);
  });

  it("leaves nothing behind when Mux refuses a new Video's upload", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    vi.spyOn(fakeMux, "createDirectUpload").mockRejectedValueOnce(new Error("mux down"));

    await expectRefused(await call(startUpload, owner, newVideo), 502, "upload-unavailable");

    expect(await revisions()).toEqual([]);
    expect(await videoTitles()).toEqual([]);
  });

  it("keeps the Video when Mux refuses a later Revision's upload", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    await seedRevision({ id: "r1", videoId: "v1", state: "ready" });
    vi.spyOn(fakeMux, "createDirectUpload").mockRejectedValueOnce(new Error("mux down"));

    await call(startUpload, owner, { videoId: "v1" });

    expect((await revisions()).map((row) => row.id)).toEqual(["r1"]);
    expect(await videoTitles()).toHaveLength(1);
  });
});

describe("cancelling an upload", () => {
  async function started() {
    const owner = await seedMember("owner");
    await seedProject("p1");
    const result = await resultOf<Started>(await call(startUpload, owner, newVideo));
    return { owner, ...result };
  }

  it("cancels at Mux and removes the Revision and its new Video", async () => {
    const { owner, revisionId } = await started();
    const cancel = vi.spyOn(fakeMux, "cancelDirectUpload");

    const response = await call(cancelUpload, owner, { revisionId });

    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(`upload_${revisionId}`);
    expect(await revisions()).toEqual([]);
    expect(await videoTitles()).toEqual([]);
  });

  it("keeps a Video that has an earlier Revision", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    await seedRevision({ id: "r1", videoId: "v1", state: "ready" });
    await seedRevision({ id: "r2", videoId: "v1", number: 2, uploadId: "u2" });

    await call(cancelUpload, owner, { revisionId: "r2" });

    expect((await revisions()).map((row) => row.id)).toEqual(["r1"]);
    expect(await videoTitles()).toHaveLength(1);
  });

  it("answers already-sent when Mux has moved past waiting", async () => {
    const { owner, revisionId } = await started();
    vi.spyOn(fakeMux, "cancelDirectUpload").mockResolvedValueOnce(false);

    await expectRefused(await call(cancelUpload, owner, { revisionId }), 409, "already-sent");
    expect(await revisions()).toHaveLength(1);
  });

  it.each(["processing", "ready", "errored"])(
    "will not cancel a Revision that is %s",
    async (state) => {
      const owner = await seedMember("owner");
      await seedProject("p1");
      await seedVideo("v1", "p1");
      await seedRevision({ id: "r1", videoId: "v1", state, uploadId: "u1" });
      const cancel = vi.spyOn(fakeMux, "cancelDirectUpload");

      await expectRefused(
        await call(cancelUpload, owner, { revisionId: "r1" }),
        409,
        "already-sent",
      );
      expect(cancel).not.toHaveBeenCalled();
      expect(await revisions()).toHaveLength(1);
    },
  );

  it("treats a repeated cancel as done", async () => {
    const { owner, revisionId } = await started();
    await call(cancelUpload, owner, { revisionId });

    expect((await call(cancelUpload, owner, { revisionId })).status).toBe(200);
  });
});
