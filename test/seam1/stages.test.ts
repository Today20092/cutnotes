import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeSignature } from "./support/fake-mux";
import { sessionToken } from "./support/clerk";
import {
  call,
  clearDatabase,
  expectRefused,
  seedMember,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { callServerFn, postWebhook, resultOf, serverFunctionIds as fn } from "./support/worker";

const owner = "user_owner";
let projectId: string;

/** A Team Member with no Project assignment yet: `user_<id>`, `member_<id>`. */
const addMember = (id: string, role = "viewer") =>
  env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at) VALUES (?, ?, ?, ?, 1)",
  )
    .bind(`member_${id}`, `user_${id}`, id, role)
    .run();
const assign = (id: string, role: string) =>
  call(fn.setProjectMember, owner, { projectId, memberId: `member_${id}`, role });
const stage = async (id = projectId) =>
  (await env.DB.prepare("SELECT stage FROM projects WHERE id = ?").bind(id).first<{
    stage: string;
  }>())!.stage;
const setStage = (caller: string, value: unknown) =>
  call(fn.setProjectStage, caller, { projectId, stage: value });
const status = async (videoId: string) =>
  (await env.DB.prepare("SELECT status FROM videos WHERE id = ?").bind(videoId).first<{
    status: string;
  }>())!.status;
/** Mux says the upload `uploadId` is a ready asset. */
const ready = (uploadId: string) => {
  const rawBody = JSON.stringify({
    type: "video.asset.ready",
    data: {
      id: `asset_${uploadId}`,
      upload_id: uploadId,
      duration: 10,
      playback_ids: [{ id: "pb", policy: "signed" }],
    },
  });
  return postWebhook(rawBody, fakeSignature(rawBody));
};
const card = async (caller = owner) =>
  (
    await resultOf<{
      projects: {
        id: string;
        stage: string;
        openNotes: number;
        latestRevision: number | null;
        changesRequested: boolean;
      }[];
    }>(await call(fn.listProjects, caller))
  ).projects.find((project) => project.id === projectId);

beforeEach(async () => {
  await clearDatabase();
  await seedMember("owner");
  const response = await call(fn.createProject, owner, { name: "Episode" });
  projectId = (await resultOf<{ id: string }>(response)).id;
  // The first call compiles the server functions.
}, 60_000);

describe("automatic Stages", () => {
  it("starts New", async () => {
    expect(await card()).toMatchObject({ stage: "new", openNotes: 0, latestRevision: null });
  });

  it("moves to Editing when an Uploader or Editor is assigned, but not for a Reviewer", async () => {
    await addMember("reviewer");
    await addMember("cutter");
    expect((await assign("reviewer", "viewer")).status).toBe(200);
    expect(await stage()).toBe("new");
    expect((await assign("cutter", "uploader")).status).toBe(200);
    expect(await stage()).toBe("editing");
  });

  it("leaves a started Project where it is when someone is assigned", async () => {
    await addMember("cutter");
    await env.DB.prepare("UPDATE projects SET stage = 'in_review'").run();
    await assign("cutter", "editor");
    expect(await stage()).toBe("in_review");
  });

  it("moves to Editing when an Uploader accepts a Project Invite", async () => {
    const created = await resultOf<{ url: string }>(
      await call(fn.createInvite, owner, { projectId, role: "uploader" }),
    );
    const redeemed = await callServerFn(fn.redeemInvite, {
      bearer: await sessionToken({ clerkUserId: "user_new", email: "new@example.com" }),
      data: { token: created.url.split("/").pop() },
    });
    expect(await resultOf(redeemed)).toMatchObject({ outcome: "joined" });
    expect(await stage()).toBe("editing");
  });

  it("stays New when a Reviewer accepts a Project Invite", async () => {
    const created = await resultOf<{ url: string }>(
      await call(fn.createInvite, owner, { projectId, role: "viewer" }),
    );
    await callServerFn(fn.redeemInvite, {
      bearer: await sessionToken({ clerkUserId: "user_new", email: "new@example.com" }),
      data: { token: created.url.split("/").pop() },
    });
    expect(await stage()).toBe("new");
  });

  it("moves to In review when a Revision is ready, and answers a change request", async () => {
    await seedVideo("v", projectId);
    await seedRevision({ id: "r", videoId: "v", uploadId: "u" });
    await env.DB.exec("UPDATE videos SET status = 'rework'");
    await env.DB.exec("UPDATE projects SET stage = 'editing'");
    const rawBody = JSON.stringify({
      type: "video.asset.ready",
      data: {
        id: "a",
        upload_id: "u",
        passthrough: "r",
        duration: 10,
        playback_ids: [{ id: "pb", policy: "signed" }],
      },
    });
    expect((await postWebhook(rawBody, fakeSignature(rawBody))).status).toBe(200);
    expect(await stage()).toBe("in_review");
    expect(await status("v")).toBe("review");
  });

  it("leaves a Complete Project's Stage alone when a Revision is ready", async () => {
    await seedVideo("v", projectId);
    await seedRevision({ id: "r", videoId: "v", uploadId: "u" });
    await env.DB.exec("UPDATE projects SET completed_at = 5, delete_after = 9999999999999");
    const rawBody = JSON.stringify({
      type: "video.asset.ready",
      data: {
        id: "a",
        upload_id: "u",
        duration: 10,
        playback_ids: [{ id: "pb", policy: "signed" }],
      },
    });
    await postWebhook(rawBody, fakeSignature(rawBody));
    expect(await stage()).toBe("new");
  });

  it("Request changes sends the Project to Editing with a hint on its card", async () => {
    await seedVideo("v", projectId);
    await seedRevision({ id: "r1", videoId: "v", state: "ready", playbackId: "pb" });
    await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "pb" });
    await env.DB.exec("UPDATE projects SET stage = 'in_review'");
    await env.DB.prepare(`INSERT INTO comments (id, revision_id, member_id, author_name, timecode_ms, body, created_at, resolved_at) VALUES
      ('open', 'r2', 'member_owner', 'owner', 0, 'Fix', 1, NULL),
      ('done', 'r2', 'member_owner', 'owner', 0, 'Fixed', 1, 2),
      ('old', 'r1', 'member_owner', 'owner', 0, 'Stale', 1, NULL)`).run();

    expect((await call(fn.requestChanges, owner, { videoId: "v", revisionId: "r2" })).status).toBe(
      200,
    );

    expect(await status("v")).toBe("rework");
    expect(await card()).toMatchObject({
      stage: "editing",
      changesRequested: true,
      latestRevision: 2,
      openNotes: 1,
    });
  });

  it("Approve marks the Project Done only once every live Video is done", async () => {
    await seedVideo("a", projectId);
    await seedVideo("b", projectId);
    await seedVideo("gone", projectId, 5);
    await seedRevision({ id: "ra", videoId: "a", state: "ready" });
    await env.DB.exec("UPDATE projects SET stage = 'in_review'");

    // Nothing ready to watch yet: there is no cut to approve.
    await expectRefused(
      await call(fn.approveVideo, owner, { videoId: "b", revisionId: "rb" }),
      409,
      "not-latest-revision",
    );
    await seedRevision({ id: "rb", videoId: "b", state: "ready" });
    expect((await call(fn.approveVideo, owner, { videoId: "a", revisionId: "ra" })).status).toBe(
      200,
    );
    expect(await status("a")).toBe("done");
    expect(await stage()).toBe("in_review");
    expect((await call(fn.approveVideo, owner, { videoId: "b", revisionId: "rb" })).status).toBe(
      200,
    );
    expect(await stage()).toBe("done");
  });

  it("a new cut after Approve is in review again, and only it can be decided", async () => {
    await seedVideo("v", projectId);
    await seedRevision({ id: "r1", videoId: "v", state: "ready" });
    expect((await call(fn.approveVideo, owner, { videoId: "v", revisionId: "r1" })).status).toBe(
      200,
    );
    expect(await stage()).toBe("done");

    await seedRevision({ id: "r2", videoId: "v", number: 2, uploadId: "u2" });
    expect((await ready("u2")).status).toBe(200);

    expect(await status("v")).toBe("review");
    expect(await stage()).toBe("in_review");
    // A decision made on the old cut is refused, so it cannot approve a cut nobody watched.
    await expectRefused(
      await call(fn.requestChanges, owner, { videoId: "v", revisionId: "r1" }),
      409,
      "not-latest-revision",
    );
    expect((await call(fn.approveVideo, owner, { videoId: "v", revisionId: "r2" })).status).toBe(
      200,
    );
    expect(await stage()).toBe("done");
    // A repeated ready event for the same cut reopens nothing.
    expect((await ready("u2")).status).toBe(200);
    expect(await status("v")).toBe("done");
  });

  it("an older cut that finishes late changes nothing", async () => {
    await seedVideo("v", projectId);
    await seedRevision({ id: "r1", videoId: "v", uploadId: "u1", state: "processing" });
    await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready" });
    await env.DB.exec("UPDATE videos SET status = 'done'");
    await env.DB.exec("UPDATE projects SET stage = 'done'");

    expect((await ready("u1")).status).toBe(200);

    const r1 = await env.DB.prepare("SELECT state FROM revisions WHERE id = 'r1'").first();
    expect(r1).toEqual({ state: "ready" });
    expect(await status("v")).toBe("done");
    expect(await stage()).toBe("done");
  });
});

describe("who may set a Stage or decide a Video", () => {
  beforeEach(async () => {
    for (const id of ["editor", "uploader", "reviewer", "outsider"])
      await addMember(id, id === "editor" || id === "outsider" ? "editor" : "viewer");
    await assign("editor", "editor");
    await assign("uploader", "uploader");
    await assign("reviewer", "viewer");
    await seedVideo("v", projectId);
    await seedRevision({ id: "r", videoId: "v", state: "ready" });
  });

  it("lets an Owner and the Project's Editor move the Stage", async () => {
    expect((await setStage(owner, "in_review")).status).toBe(200);
    expect(await stage()).toBe("in_review");
    expect((await setStage("user_editor", "done")).status).toBe(200);
    expect(await stage()).toBe("done");
  });

  it.each(["user_uploader", "user_reviewer", "user_outsider"])(
    "refuses %s, even a Team Editor who is not on the Project",
    async (caller) => {
      await expectRefused(await setStage(caller, "done"), 404, "not-found");
      await expectRefused(
        await call(fn.requestChanges, caller, { videoId: "v", revisionId: "r" }),
        404,
        "not-found",
      );
      await expectRefused(
        await call(fn.approveVideo, caller, { videoId: "v", revisionId: "r" }),
        404,
        "not-found",
      );
      expect(await stage()).toBe("editing");
      expect(await status("v")).toBe("review");
    },
  );

  it("lets the Project's Editor decide a Video", async () => {
    expect(
      (await call(fn.requestChanges, "user_editor", { videoId: "v", revisionId: "r" })).status,
    ).toBe(200);
    expect(await status("v")).toBe("rework");
  });

  it.each([["archived"], [""], [7], [undefined]])("refuses Stage %s", async (value) => {
    await expectRefused(await setStage(owner, value), 400, "invalid-request");
    expect(await stage()).toBe("editing");
  });

  it("checks Access before it reads the input", async () => {
    await expectRefused(
      await callServerFn(fn.setProjectStage, { data: { projectId, stage: "nope" } }),
      401,
      "signed-out",
    );
    await expectRefused(
      await callServerFn(fn.approveVideo, { data: { videoId: "v" } }),
      401,
      "signed-out",
    );
    await expectRefused(
      await call(fn.approveVideo, owner, { videoId: "v" }),
      400,
      "invalid-request",
    );
  });

  it("changes nothing in a Complete Project", async () => {
    await env.DB.exec("UPDATE projects SET completed_at = 5, delete_after = 9999999999999");
    await expectRefused(await setStage(owner, "done"), 404, "not-found");
    expect(await stage()).toBe("editing");
  });
});

describe("the 0010 backfill", () => {
  it("sets Done, In review or New from the Revisions and Statuses already there", async () => {
    await env.DB.prepare(`INSERT INTO projects (id, name, created_by, created_at, updated_at) VALUES
      ('finished', 'Finished', 'member_owner', 1, 1), ('reviewing', 'Reviewing', 'member_owner', 1, 1),
      ('empty', 'Empty', 'member_owner', 1, 1), ('processing', 'Processing', 'member_owner', 1, 1)`).run();
    for (const [video, project, state] of [
      ["f", "finished", "ready"],
      ["r", "reviewing", "ready"],
      ["p", "processing", "processing"],
    ] as const) {
      await seedVideo(video, project);
      await seedRevision({ id: video, videoId: video, state });
    }
    // A deleted Video that is not done does not hold a finished Project back.
    await seedVideo("deleted", "finished", 5);
    await env.DB.exec("UPDATE videos SET status = 'done' WHERE id = 'f'");
    await env.DB.exec("UPDATE projects SET stage = 'new'");

    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith("0010_"))!;
    for (const query of migration.queries.filter((q) => q.includes("UPDATE `projects`")))
      await env.DB.prepare(query).run();

    const rows = await env.DB.prepare("SELECT id, stage FROM projects ORDER BY id").all();
    expect(Object.fromEntries(rows.results.map((row) => [row.id, row.stage]))).toEqual({
      empty: "new",
      finished: "done",
      processing: "new",
      reviewing: "in_review",
      [projectId]: "new",
    });
  });
});
