import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { call, clearDatabase, expectRefused, seedMember, seedProject, seedRevision, seedVideo } from "./support/seed";
import { resultOf, serverFunctionIds } from "./support/worker";

beforeEach(clearDatabase);

it("returns ready history while a newer Revision processes", async () => {
  const owner = await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "old", videoId: "v", state: "ready" });
  await seedRevision({ id: "current", videoId: "v", state: "ready", number: 2 });
  await seedRevision({ id: "processing", videoId: "v", state: "processing", number: 3 });
  expect(await resultOf(await call(serverFunctionIds.getReview, owner, { videoId: "v" }))).toMatchObject({
    revision: { id: "current" }, history: [{ id: "current", number: 2 }, { id: "old", number: 1 }],
  });
});

it("allocates distinct consecutive numbers under concurrent uploads without changing Status", async () => {
  const owner = await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "first", videoId: "v", state: "ready" });
  await call(serverFunctionIds.setVideoStatus, owner, { videoId: "v", status: "done" });
  const answers = await Promise.all(Array.from({ length: 4 }, () => call(serverFunctionIds.startUpload, owner, { videoId: "v" })));
  expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200]);
  await env.DB.exec("UPDATE revisions SET state = 'ready' WHERE video_id = 'v'");
  expect(await resultOf(await call(serverFunctionIds.getReview, owner, { videoId: "v" }))).toMatchObject({
    history: [{ number: 5 }, { number: 4 }, { number: 3 }, { number: 2 }, { number: 1 }],
  });
  expect(await resultOf(await call(serverFunctionIds.getProject, owner, { projectId: "p" }))).toMatchObject({ videos: [{ status: "done" }] });
});

it("acknowledges only the caller's activity and never moves a read marker backwards", async () => {
  const owner = await seedMember("owner");
  const viewer = await seedMember("viewer");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "r", videoId: "v", state: "ready" });
  const list = async (caller: string) => resultOf<{ videos: { unread: boolean }[] }>(await call(serverFunctionIds.listProjects, caller));
  const data = { videoId: "v", readAt: Date.now(), memberId: "member_owner" };
  expect((await call(serverFunctionIds.markVideoRead, viewer, data)).status).toBe(200);
  expect((await list(viewer)).videos[0]?.unread).toBe(false);
  await call(serverFunctionIds.markVideoRead, viewer, { videoId: "v", readAt: 0 });
  expect((await list(viewer)).videos[0]?.unread).toBe(false);
  expect((await list(owner)).videos[0]?.unread).toBe(false);
});

it("marks other Members' ready Revisions unread but ignores own activity", async () => {
  const owner = await seedMember("owner");
  const viewer = await seedMember("viewer");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "old", videoId: "v", state: "ready" });
  const list = async (caller: string) => resultOf<{ videos: { unread: boolean }[] }>(await call(serverFunctionIds.listProjects, caller));
  expect((await list(owner)).videos[0]?.unread).toBe(false);
  expect((await list(viewer)).videos[0]?.unread).toBe(true);
});

it("ignores own Comments but sees others and Guests on older Revisions, independently per Member", async () => {
  const owner = await seedMember("owner");
  const viewer = await seedMember("viewer");
  const editor = await seedMember("editor");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "old", videoId: "v", state: "ready" });
  await seedRevision({ id: "new", videoId: "v", state: "ready", number: 2 });
  await env.DB.exec("UPDATE revisions SET duration_ms = 8000");
  const readAt = Date.now();
  for (const caller of [owner, viewer, editor]) await call(serverFunctionIds.markVideoRead, caller, { videoId: "v", readAt });
  await env.DB.prepare("INSERT INTO comments (id, revision_id, member_id, author_name, timecode_ms, body, created_at) VALUES ('c', 'old', 'member_viewer', 'Viewer', 0, 'Older cut', ?)").bind(readAt + 1).run();
  const unread = async (caller: string) => (await resultOf<{ videos: { unread: boolean }[] }>(await call(serverFunctionIds.listProjects, caller))).videos[0]?.unread;
  expect(await unread(viewer)).toBe(false);
  expect(await unread(owner)).toBe(true);
  // A delayed acknowledgement of an earlier read must not swallow new activity.
  await call(serverFunctionIds.markVideoRead, owner, { videoId: "v", readAt, memberId: "member_editor" });
  expect(await unread(owner)).toBe(true);
  expect(await unread(editor)).toBe(true);
  await env.DB.exec("UPDATE comments SET member_id = NULL, share_link_id = 'guest-link' WHERE id = 'c'");
  expect(await unread(viewer)).toBe(true);
  expect(await resultOf(await call(serverFunctionIds.getReview, owner, { videoId: "v", revisionId: "old" }))).toMatchObject({ comments: [{ id: "c" }] });
  expect(await resultOf(await call(serverFunctionIds.getReview, owner, { videoId: "v" }))).toMatchObject({ comments: [] });
});

it.each([-1, 1.5, "1", null, Number.MAX_SAFE_INTEGER])("refuses invalid read timestamps %s", async (readAt) => {
  const owner = await seedMember("owner");
  await expectRefused(await call(serverFunctionIds.markVideoRead, owner, { videoId: "v", readAt }), 400, "invalid-request");
});

it("allows acknowledgement in Complete Projects but refuses deleted and missing Videos", async () => {
  const owner = await seedMember("owner");
  await seedProject("p", { completedAt: 1 });
  await seedVideo("v", "p");
  expect((await call(serverFunctionIds.markVideoRead, owner, { videoId: "v", readAt: 1 })).status).toBe(200);
  await env.DB.exec("UPDATE videos SET deleted_at = 1 WHERE id = 'v'");
  for (const videoId of ["v", "missing"]) await expectRefused(await call(serverFunctionIds.markVideoRead, owner, { videoId, readAt: 1 }), 404, "not-found");
});

it("refuses selecting a different Video's Revision or an unready Revision", async () => {
  const owner = await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedVideo("other", "p");
  await seedRevision({ id: "foreign", videoId: "other", state: "ready" });
  await seedRevision({ id: "processing", videoId: "v", state: "processing" });
  for (const revisionId of ["foreign", "processing"]) await expectRefused(await call(serverFunctionIds.getReview, owner, { videoId: "v", revisionId }), 404, "not-found");
});
