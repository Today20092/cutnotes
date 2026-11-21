import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeMux } from "./support/fake-mux";
import { call, clearDatabase, seedMember, seedRevision, seedVideo } from "./support/seed";
import { resultOf, serverFunctionIds as fn } from "./support/worker";
import { sessionToken } from "./support/clerk";
import { callServerFn } from "./support/worker";

let projectId: string;
const owner = "user_owner";
const editor = "user_editor";
const reviewer = "user_viewer";
const assign = (memberId: string, role = "viewer", target = projectId) =>
  call(fn.setProjectMember, owner, { projectId: target, memberId, role });
const invite = async (role = "editor") => {
  const response = await call(fn.createInvite, owner, {
    projectId,
    role,
    note: "Alex — episode 12",
  });
  expect(response.status).toBe(200);
  return resultOf<{ url: string; invite: { id: string } }>(response);
};
const redeem = async (url: string, clerkUserId = "user_new") =>
  callServerFn(fn.redeemInvite, {
    bearer: await sessionToken({ clerkUserId, email: `${clerkUserId}@example.com` }),
    data: { token: url.split("/").pop() },
  });
const projectList = async (caller: string) =>
  resultOf<{ projects: { id: string }[]; videos: { id: string; posterUrl: string | null }[] }>(
    await call(fn.listProjects, caller),
  );

beforeEach(async () => {
  await clearDatabase();
  for (const role of ["owner", "editor", "viewer"]) await seedMember(role);
  const response = await call(fn.createProject, owner, { name: "Private project" });
  projectId = (await resultOf<{ id: string }>(response)).id;
  await seedVideo("video", projectId);
  await seedRevision({ id: "revision", videoId: "video", state: "ready", playbackId: "sample" });
  await env.DB.exec("UPDATE revisions SET duration_ms = 8000");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([editor, reviewer])(
  "%s sees no unassigned project, video, comment, or media credentials",
  async (caller) => {
    expect(await projectList(caller)).toEqual(
      expect.objectContaining({ projects: [], videos: [] }),
    );
    expect((await call(fn.getProject, caller, { projectId })).status).toBe(404);
    const playback = vi.spyOn(fakeMux, "createPlayback");
    expect(
      await resultOf(
        await call(fn.getReview, caller, { videoId: "video", revisionId: "revision" }),
      ),
    ).toMatchObject({ video: null, playback: null, comments: [], history: [] });
    expect(playback).not.toHaveBeenCalled();
    expect(
      (await call(fn.markVideoRead, caller, { videoId: "video", readAt: Date.now() })).status,
    ).toBe(404);
    expect(
      (
        await call(fn.createComment, caller, {
          id: "forged",
          videoId: "video",
          revisionId: "revision",
          body: "No",
          timecodeMs: 0,
        })
      ).status,
    ).toBe(400);
  },
);

it("Owners see all projects; an Editor automatically joins only their own new project", async () => {
  expect(await resultOf(await call(fn.listProjectMembers, owner, { projectId }))).toMatchObject({
    members: expect.arrayContaining([
      expect.objectContaining({ id: "member_owner", teamRole: "owner" }),
      expect.objectContaining({ id: "member_editor", teamRole: "editor", role: null }),
    ]),
  });
  const created = await resultOf<{ id: string }>(
    await call(fn.createProject, editor, { name: "Editor project" }),
  );
  expect((await projectList(editor)).projects.map((p) => p.id)).toEqual([created.id]);
  expect((await projectList(owner)).projects).toHaveLength(2);
  expect((await projectList(reviewer)).projects).toEqual([]);
  expect(
    await resultOf(await call(fn.getProject, editor, { projectId: created.id })),
  ).toMatchObject({ project: { role: "editor" } });
});

it("project roles control uploads independently of the team role", async () => {
  expect((await assign("member_editor", "viewer")).status).toBe(200);
  expect((await assign("member_viewer", "editor")).status).toBe(200);
  expect((await call(fn.startUpload, editor, { projectId, title: "No upload" })).status).toBe(404);
  expect(
    (await call(fn.renameVideo, editor, { videoId: "video", title: "No rename" })).status,
  ).toBe(404);
  expect(
    (await call(fn.startUpload, reviewer, { projectId, title: "Allowed upload" })).status,
  ).toBe(200);
  expect((await call(fn.createProject, reviewer, { name: "No creation permission" })).status).toBe(
    403,
  );
  expect(await resultOf(await call(fn.getReview, reviewer, { videoId: "video" }))).toMatchObject({
    video: { role: "editor" },
    member: { role: "viewer" },
  });
});

it("removal preserves contributions and refuses access to an owned video or comment", async () => {
  await assign("member_editor", "editor");
  await env.DB.exec("UPDATE videos SET created_by = 'member_editor'");
  await call(fn.createComment, editor, {
    id: "kept",
    videoId: "video",
    revisionId: "revision",
    body: "Keep my contribution",
    timecodeMs: 0,
  });
  expect(
    (await call(fn.removeProjectMember, owner, { projectId, memberId: "member_editor" })).status,
  ).toBe(200);
  expect((await call(fn.deleteVideo, editor, { videoId: "video" })).status).toBe(404);
  expect(
    (
      await call(fn.editComment, editor, {
        id: "kept",
        videoId: "video",
        revisionId: "revision",
        body: "Forbidden",
      })
    ).status,
  ).toBe(404);
  expect(await env.DB.prepare("SELECT body FROM comments WHERE id = 'kept'").first("body")).toBe(
    "Keep my contribution",
  );
  expect((await projectList(owner)).videos).toHaveLength(1);
});

it("project invitations admit new people to one project without granting project creation", async () => {
  await call(fn.createProject, owner, { name: "Unrelated private project" });
  const { url, invite: created } = await invite();
  const preview = await resultOf(
    await callServerFn(fn.getInvitePreview, { data: { token: url.split("/").pop() } }),
  );
  expect(preview).toMatchObject({ title: "You're invited to Private project" });
  expect(await resultOf(await redeem(url))).toEqual({ outcome: "joined", projectId });
  expect((await projectList("user_new")).projects.map((p) => p.id)).toEqual([projectId]);
  expect((await call(fn.startUpload, "user_new", { projectId, title: "New cut" })).status).toBe(
    200,
  );
  expect((await call(fn.createProject, "user_new", { name: "Not allowed" })).status).toBe(403);
  const history = await resultOf<{ invites: unknown[] }>(await call(fn.listInvites, owner));
  expect(history.invites).toContainEqual(
    expect.objectContaining({
      id: created.id,
      note: "Alex — episode 12",
      projectName: "Private project",
      createdBy: "owner",
      acceptedBy: "user_new@example.com",
    }),
  );
  expect(JSON.stringify(history)).not.toContain(url.split("/").pop());
  expect((await call(fn.revokeInvite, owner, { id: created.id })).status).toBe(404);
});

it.each([
  { role: "owner" },
  { role: "admin" },
  { role: "editor", note: 42 },
  { role: "viewer", note: "x".repeat(241) },
])("rejects invalid project invitation input %j", async (data) => {
  expect((await call(fn.createInvite, owner, { projectId, ...data })).status).toBe(400);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM invites").first("n")).toBe(0);
});

it("Owners cannot be downgraded or removed through project membership", async () => {
  expect((await assign("member_owner", "viewer")).status).toBe(404);
  expect(
    (await call(fn.removeProjectMember, owner, { projectId, memberId: "member_owner" })).status,
  ).toBe(404);
  expect((await call(fn.getProject, owner, { projectId })).status).toBe(200);
});

it("an existing team Editor can accept a project Reviewer invitation without losing creation permission", async () => {
  const { url } = await invite("viewer");
  expect(await resultOf(await redeem(url, editor))).toEqual({ outcome: "joined", projectId });
  expect(await resultOf(await call(fn.getProject, editor, { projectId }))).toMatchObject({
    member: { role: "editor" },
    project: { role: "viewer" },
  });
  expect((await call(fn.createProject, editor, { name: "Still allowed" })).status).toBe(200);
});

it("one project invitation admits exactly one person under concurrent acceptance", async () => {
  const { url } = await invite();
  const outcomes = await Promise.all(
    ["a", "b", "c", "d"].map(async (person) =>
      resultOf<{ outcome: string }>(await redeem(url, person)),
    ),
  );
  expect(outcomes.filter((r) => r.outcome === "joined")).toHaveLength(1);
  expect(
    await env.DB.prepare(
      "SELECT count(*) AS n FROM project_members WHERE project_id = ? AND member_id <> 'member_owner'",
    )
      .bind(projectId)
      .first("n"),
  ).toBe(1);
});

it.each(["revoked", "expired", "deleted"])(
  "a %s project invitation grants no access or team membership",
  async (state) => {
    const { url, invite: created } = await invite();
    if (state === "revoked") await call(fn.revokeInvite, owner, { id: created.id });
    if (state === "expired")
      await env.DB.prepare("UPDATE invites SET expires_at = 1 WHERE id = ?").bind(created.id).run();
    if (state === "deleted") await call(fn.deleteProject, owner, { projectId });
    expect(await resultOf(await redeem(url))).toMatchObject({ outcome: "unavailable" });
    expect(
      await env.DB.prepare("SELECT id FROM members WHERE clerk_user_id = 'user_new'").first(),
    ).toBeNull();
  },
);

it("removing someone from the team clears old assignments; a new invitation restores only its project", async () => {
  await assign("member_editor", "editor");
  const second = await resultOf<{ id: string }>(
    await call(fn.createProject, owner, { name: "Other private work" }),
  );
  await assign("member_editor", "editor", second.id);
  await call(fn.removeMember, owner, { id: "member_editor" });
  expect(
    await env.DB.prepare(
      "SELECT count(*) AS n FROM project_members WHERE member_id = 'member_editor'",
    ).first("n"),
  ).toBe(0);
  const { url } = await invite();
  expect(await resultOf(await redeem(url, editor))).toEqual({ outcome: "joined", projectId });
  expect((await projectList(editor)).projects.map((p) => p.id)).toEqual([projectId]);
  expect(
    (await call(fn.createProject, editor, { name: "No old team Editor permission" })).status,
  ).toBe(403);
});

it("a used invitation cannot restore project access when removal and retry happen in the same millisecond", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
  const { url } = await invite();
  await redeem(url, editor);
  await call(fn.removeProjectMember, owner, { projectId, memberId: "member_editor" });
  expect(await resultOf(await redeem(url, editor))).toEqual({
    outcome: "unavailable",
    reason: "used",
  });
  expect((await projectList(editor)).projects).toEqual([]);
});

it("a project membership removal racing an upload prevents Mux allocation", async () => {
  await assign("member_editor", "editor");
  const batch = env.DB.batch.bind(env.DB);
  vi.spyOn(env.DB, "batch").mockImplementationOnce(async (statements) => {
    const result = await batch(statements);
    await env.DB.prepare("DELETE FROM project_members WHERE member_id = 'member_editor'").run();
    return result;
  });
  const mux = vi.spyOn(fakeMux, "createDirectUpload");
  expect((await call(fn.startUpload, editor, { projectId, title: "Too late" })).status).toBe(404);
  expect(mux).not.toHaveBeenCalled();
});

it("guest links survive project membership removal until the Owner revokes them", async () => {
  await assign("member_editor", "editor");
  const link = await resultOf<{ id: string; token: string }>(
    await call(fn.createShareLink, owner, { videoId: "video", name: "Client", permission: "view" }),
  );
  await call(fn.removeProjectMember, owner, { projectId, memberId: "member_editor" });
  expect((await callServerFn(fn.getGuestReview, { data: { token: link.token } })).status).toBe(200);
  await call(fn.revokeShareLink, owner, { id: link.id });
  expect((await callServerFn(fn.getGuestReview, { data: { token: link.token } })).status).toBe(404);
});
