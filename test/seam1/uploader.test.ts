import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { sessionToken } from "./support/clerk";
import { call, clearDatabase, seedMember, seedRevision, seedVideo } from "./support/seed";
import { callServerFn, resultOf, serverFunctionIds as fn } from "./support/worker";

const owner = "user_owner";
const editor = "user_editor";
const viewer = "user_viewer";
let assigned: string;
let other: string;

const created = async <T>(response: Response) => {
  expect(response.status).toBe(200);
  return resultOf<T>(response);
};
const newProject = async (name: string) =>
  (await created<{ id: string }>(await call(fn.createProject, owner, { name }))).id;
const assign = (projectId: string, memberId: string, role: string) =>
  call(fn.setProjectMember, owner, { projectId, memberId, role });
const visible = async (caller: string) =>
  (await created<{ projects: { id: string }[] }>(await call(fn.listProjects, caller))).projects
    .map((project) => project.id)
    .sort();
const roleOn = async (caller: string, projectId: string) =>
  (await created<{ project: { role: string } }>(await call(fn.getProject, caller, { projectId })))
    .project.role;

beforeEach(async () => {
  await clearDatabase();
  for (const role of ["owner", "editor", "viewer"]) await seedMember(role);
  assigned = await newProject("Assigned");
  other = await newProject("Other");
  // The first server-function call compiles Start, which outlasts the default hook timeout.
}, 60_000);

it("an Uploader adds Videos and Revisions to their own Videos, and nothing else", async () => {
  expect((await assign(assigned, "member_viewer", "uploader")).status).toBe(200);
  expect(await roleOn(viewer, assigned)).toBe("uploader");
  await seedVideo("theirs", assigned);
  await seedRevision({ id: "cut", videoId: "theirs", state: "ready", playbackId: "sample" });
  await env.DB.exec("UPDATE revisions SET duration_ms = 8000");

  const own = await created<{ videoId: string; revisionId: string }>(
    await call(fn.startUpload, viewer, { projectId: assigned, title: "My cut" }),
  );
  const second = await created<{ revisionId: string }>(
    await call(fn.startUpload, viewer, { videoId: own.videoId }),
  );
  expect((await call(fn.cancelUpload, viewer, { revisionId: second.revisionId })).status).toBe(200);
  expect((await call(fn.startUpload, viewer, { videoId: "theirs" })).status).toBe(404);

  for (const videoId of [own.videoId, "theirs"]) {
    expect((await call(fn.renameVideo, viewer, { videoId, title: "Renamed" })).status).toBe(404);
    expect((await call(fn.approveVideo, viewer, { videoId })).status).toBe(404);
    expect((await call(fn.requestChanges, viewer, { videoId })).status).toBe(404);
  }
  expect((await call(fn.renameProject, viewer, { projectId: assigned, name: "Mine" })).status).toBe(
    404,
  );
  const comment = { videoId: "theirs", revisionId: "cut", id: "note", body: "Hi", timecodeMs: 0 };
  expect((await call(fn.createComment, viewer, comment)).status).toBe(200);
  expect((await call(fn.resolveComment, viewer, { ...comment, resolved: true })).status).toBe(404);

  expect((await call(fn.deleteVideo, viewer, { videoId: "theirs" })).status).toBe(404);
  expect((await call(fn.deleteVideo, viewer, { videoId: own.videoId })).status).toBe(200);
  // The assignment does not reach other Projects.
  expect((await call(fn.startUpload, viewer, { projectId: other, title: "No" })).status).toBe(404);
});

it("a Project Invite admits a new person as an Uploader of that Project only", async () => {
  expect((await call(fn.createInvite, owner, { projectId: assigned, role: "owner" })).status).toBe(
    400,
  );
  expect((await call(fn.createInvite, owner, { role: "uploader" })).status).toBe(400);

  const { url } = await created<{ url: string }>(
    await call(fn.createInvite, owner, { projectId: assigned, role: "uploader", note: "Cutter" }),
  );
  const token = url.split("/").pop();
  expect(await created(await callServerFn(fn.getInvitePreview, { data: { token } }))).toMatchObject(
    { title: "You're invited to Assigned", description: expect.stringContaining("as an Uploader") },
  );
  const redeem = async (clerkUserId: string, inviteToken = token) =>
    resultOf(
      await callServerFn(fn.redeemInvite, {
        bearer: await sessionToken({ clerkUserId, email: `${clerkUserId}@example.com` }),
        data: { token: inviteToken },
      }),
    );
  expect(await redeem("user_new")).toEqual({ outcome: "joined", projectId: assigned });
  expect(await visible("user_new")).toEqual([assigned]);
  expect(await roleOn("user_new", assigned)).toBe("uploader");
  expect((await call(fn.createProject, "user_new", { name: "No" })).status).toBe(403);

  const again = await created<{ url: string }>(
    await call(fn.createInvite, owner, { projectId: assigned, role: "editor" }),
  );
  expect(await redeem("user_new", again.url.split("/").pop())).toEqual({
    outcome: "already-member",
    projectId: assigned,
  });
  expect(await roleOn("user_new", assigned)).toBe("uploader");
});

it("everyone with access sees who else is on a Project; Owners are implicit and omitted", async () => {
  await assign(assigned, "member_viewer", "uploader");
  await assign(assigned, "member_editor", "viewer");
  const people = [
    expect.objectContaining({ id: "member_viewer", role: "uploader", avatarUrl: null }),
    expect.objectContaining({ id: "member_editor", role: "viewer" }),
  ];

  const page = await created<{ project: { people: { id: string }[] } }>(
    await call(fn.getProject, viewer, { projectId: assigned }),
  );
  expect(page.project.people).toEqual(people);

  const list = await created<{ projects: { id: string; people: unknown[] }[] }>(
    await call(fn.listProjects, owner),
  );
  expect(list.projects.find((project) => project.id === assigned)?.people).toEqual(people);
  expect(list.projects.find((project) => project.id === other)?.people).toEqual([]);
  // A Team Editor sees only the Projects they are on, and so only those people.
  expect(await visible(editor)).toEqual([assigned]);
});

it("the Team list shows each Member's Projects with their role", async () => {
  await assign(assigned, "member_viewer", "uploader");
  await assign(other, "member_viewer", "editor");
  const team = await created<{ members: { id: string; projects: unknown[] }[] }>(
    await call(fn.listMembers, owner),
  );
  expect(team.members.find((member) => member.id === "member_viewer")?.projects).toEqual([
    expect.objectContaining({ id: assigned, name: "Assigned", role: "uploader" }),
    expect.objectContaining({ id: other, name: "Other", role: "editor" }),
  ]);
  expect(team.members.find((member) => member.id === "member_editor")?.projects).toEqual([]);
  expect((await call(fn.listMembers, editor)).status).toBe(403);
});
