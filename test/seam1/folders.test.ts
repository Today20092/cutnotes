import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { sessionToken } from "./support/clerk";
import { call, clearDatabase, seedMember, seedRevision, seedVideo } from "./support/seed";
import { callServerFn, resultOf, serverFunctionIds as fn } from "./support/worker";

const owner = "user_owner";
const editor = "user_editor";
const viewer = "user_viewer";
let folderId: string;
let filed: string;
let loose: string;

const created = async <T>(response: Response) => {
  expect(response.status).toBe(200);
  return resultOf<T>(response);
};
const newProject = async (caller: string, name: string, folder?: string) =>
  call(fn.createProject, caller, { name, folderId: folder });
const assignFolder = (memberId: string, role: string, folder = folderId) =>
  call(fn.setFolderMember, owner, { folderId: folder, memberId, role });
const move = (projectId: string, folder: string | null) =>
  call(fn.moveProject, owner, { projectId, folderId: folder });

type List = {
  folders: { id: string; name: string; role: string; projectCount: number }[];
  projects: { id: string; folderId: string | null; role: string }[];
};
const listOf = async (caller: string) => created<List>(await call(fn.listProjects, caller));
const visible = async (caller: string) =>
  (await listOf(caller)).projects.map((project) => project.id).sort();
const roleOn = async (caller: string, projectId: string) =>
  (await created<{ project: { role: string } }>(await call(fn.getProject, caller, { projectId })))
    .project.role;

beforeEach(async () => {
  await clearDatabase();
  for (const role of ["owner", "editor", "viewer"]) await seedMember(role);
  folderId = (
    await created<{ id: string }>(await call(fn.createFolder, owner, { name: "Client A" }))
  ).id;
  filed = (await created<{ id: string }>(await newProject(owner, "Filed", folderId))).id;
  loose = (await created<{ id: string }>(await newProject(owner, "Loose"))).id;
  // The first server-function call compiles Start, which outlasts the default hook timeout.
}, 60_000);

it("a Folder assignment opens every Project in it, including ones moved in later, until moved out", async () => {
  expect((await assignFolder("member_viewer", "viewer")).status).toBe(200);
  expect(await listOf(viewer)).toMatchObject({
    folders: [{ id: folderId, name: "Client A", role: "viewer", projectCount: 1 }],
    projects: [{ id: filed, folderId, role: "viewer" }],
  });

  expect((await move(loose, folderId)).status).toBe(200);
  expect(await visible(viewer)).toEqual([filed, loose].sort());
  expect(
    (await created<{ projects: unknown[] }>(await call(fn.getFolder, viewer, { folderId })))
      .projects,
  ).toHaveLength(2);

  expect((await move(loose, null)).status).toBe(200);
  expect(await visible(viewer)).toEqual([filed]);
  expect((await call(fn.getProject, viewer, { projectId: loose })).status).toBe(404);
});

it("a Team Editor without an assignment sees nothing in the Folder", async () => {
  await assignFolder("member_viewer", "editor");
  expect(await listOf(editor)).toMatchObject({ folders: [], projects: [] });
  expect((await call(fn.getFolder, editor, { folderId })).status).toBe(404);
  expect((await call(fn.getProject, editor, { projectId: filed })).status).toBe(404);
  expect((await call(fn.startUpload, editor, { projectId: filed, title: "No" })).status).toBe(404);
});

it("a direct assignment inside an unshared Folder hides the Folder itself", async () => {
  await call(fn.setProjectMember, owner, {
    projectId: filed,
    memberId: "member_viewer",
    role: "viewer",
  });
  expect(await listOf(viewer)).toMatchObject({
    folders: [],
    projects: [{ id: filed, folderId: null }],
  });
});

it("the effective role is the higher of the direct and Folder assignments", async () => {
  await assignFolder("member_viewer", "viewer");
  await call(fn.setProjectMember, owner, {
    projectId: filed,
    memberId: "member_viewer",
    role: "editor",
  });
  expect(await roleOn(viewer, filed)).toBe("editor");

  await assignFolder("member_viewer", "uploader");
  await call(fn.setProjectMember, owner, {
    projectId: filed,
    memberId: "member_viewer",
    role: "viewer",
  });
  expect(await roleOn(viewer, filed)).toBe("uploader");
  expect(await roleOn(owner, filed)).toBe("owner");

  expect(
    await created(await call(fn.listProjectMembers, owner, { projectId: filed })),
  ).toMatchObject({
    folder: { id: folderId, name: "Client A" },
    members: expect.arrayContaining([
      expect.objectContaining({ id: "member_viewer", role: "viewer", folderRole: "uploader" }),
      expect.objectContaining({ id: "member_editor", role: null, folderRole: null }),
    ]),
  });
});

it("an Uploader adds Videos and Revisions to their own Videos, and nothing else", async () => {
  await assignFolder("member_viewer", "uploader");
  await seedVideo("theirs", filed);
  await seedRevision({ id: "cut", videoId: "theirs", state: "ready", playbackId: "sample" });
  await env.DB.exec("UPDATE revisions SET duration_ms = 8000");

  const own = await created<{ videoId: string; revisionId: string }>(
    await call(fn.startUpload, viewer, { projectId: filed, title: "My cut" }),
  );
  const second = await created<{ revisionId: string }>(
    await call(fn.startUpload, viewer, { videoId: own.videoId }),
  );
  expect((await call(fn.cancelUpload, viewer, { revisionId: second.revisionId })).status).toBe(200);
  expect((await call(fn.startUpload, viewer, { videoId: "theirs" })).status).toBe(404);

  for (const videoId of [own.videoId, "theirs"]) {
    expect((await call(fn.renameVideo, viewer, { videoId, title: "Renamed" })).status).toBe(404);
    expect((await call(fn.setVideoStatus, viewer, { videoId, status: "done" })).status).toBe(404);
  }
  expect((await call(fn.renameProject, viewer, { projectId: filed, name: "Mine" })).status).toBe(
    404,
  );
  const comment = { videoId: "theirs", revisionId: "cut", id: "note", body: "Hi", timecodeMs: 0 };
  expect((await call(fn.createComment, viewer, comment)).status).toBe(200);
  expect((await call(fn.resolveComment, viewer, { ...comment, resolved: true })).status).toBe(404);

  expect((await call(fn.deleteVideo, viewer, { videoId: "theirs" })).status).toBe(404);
  expect((await call(fn.deleteVideo, viewer, { videoId: own.videoId })).status).toBe(200);
  // Folder Uploader does not reach Projects outside the Folder.
  expect((await call(fn.startUpload, viewer, { projectId: loose, title: "No" })).status).toBe(404);
});

it("removing someone from the Team clears their Folder assignments", async () => {
  await assignFolder("member_viewer", "editor");
  expect((await call(fn.removeMember, owner, { id: "member_viewer" })).status).toBe(200);
  expect(
    await env.DB.prepare(
      "SELECT count(*) AS n FROM folder_members WHERE member_id = 'member_viewer'",
    ).first("n"),
  ).toBe(0);
});

it("deleting a Folder leaves its Projects unfiled and ends access held only through it", async () => {
  await assignFolder("member_viewer", "viewer");
  expect((await call(fn.deleteFolder, owner, { folderId })).status).toBe(200);
  expect(await visible(viewer)).toEqual([]);
  expect((await listOf(owner)).projects).toContainEqual(
    expect.objectContaining({ id: filed, folderId: null }),
  );
});

it("a Folder Invite admits a new person to the Folder's Projects only", async () => {
  expect((await call(fn.createInvite, owner, { folderId, role: "owner" })).status).toBe(400);
  expect(
    (await call(fn.createInvite, owner, { folderId, projectId: filed, role: "viewer" })).status,
  ).toBe(400);
  expect((await call(fn.createInvite, owner, { role: "uploader" })).status).toBe(400);

  const { url } = await created<{ url: string }>(
    await call(fn.createInvite, owner, { folderId, role: "uploader", note: "Cutter" }),
  );
  const token = url.split("/").pop();
  expect(await created(await callServerFn(fn.getInvitePreview, { data: { token } }))).toMatchObject(
    {
      title: "You're invited to the Client A folder",
      description: expect.stringContaining("as an Uploader"),
    },
  );
  const redeem = async (clerkUserId: string, inviteToken = token) =>
    resultOf(
      await callServerFn(fn.redeemInvite, {
        bearer: await sessionToken({ clerkUserId, email: `${clerkUserId}@example.com` }),
        data: { token: inviteToken },
      }),
    );
  expect(await redeem("user_new")).toEqual({ outcome: "joined", folderId });
  expect(await visible("user_new")).toEqual([filed]);
  expect(await roleOn("user_new", filed)).toBe("uploader");
  expect((await call(fn.createProject, "user_new", { name: "No" })).status).toBe(403);

  const history = await created<{ invites: unknown[] }>(await call(fn.listInvites, owner));
  expect(history.invites).toContainEqual(
    expect.objectContaining({ folderId, folderName: "Client A", role: "uploader" }),
  );

  const again = await created<{ url: string }>(
    await call(fn.createInvite, owner, { folderId, role: "editor" }),
  );
  expect(await redeem("user_new", again.url.split("/").pop())).toEqual({
    outcome: "already-member",
    folderId,
  });
  expect(await roleOn("user_new", filed)).toBe("uploader");
});

it("only Owners manage Folders", async () => {
  await assignFolder("member_editor", "editor");
  for (const [id, data] of [
    [fn.createFolder, { name: "Mine" }],
    [fn.renameFolder, { folderId, name: "Mine" }],
    [fn.deleteFolder, { folderId }],
    [fn.moveProject, { projectId: filed, folderId: null }],
    [fn.setFolderMember, { folderId, memberId: "member_viewer", role: "editor" }],
    [fn.removeFolderMember, { folderId, memberId: "member_editor" }],
    [fn.listFolderMembers, { folderId }],
  ] as const) {
    expect((await call(id, editor, data)).status).toBe(403);
  }
  expect((await call(fn.renameFolder, owner, { folderId, name: "Client B" })).status).toBe(200);
  expect(await created(await call(fn.listFolderMembers, owner, { folderId }))).toMatchObject({
    folder: { name: "Client B" },
    members: expect.arrayContaining([
      expect.objectContaining({ id: "member_editor", role: "editor" }),
    ]),
  });
});

it("a Team Editor creates a Project in a Folder only as its Folder Editor", async () => {
  expect((await newProject(editor, "Refused", folderId)).status).toBe(404);
  await assignFolder("member_editor", "uploader");
  expect((await newProject(editor, "Refused", folderId)).status).toBe(404);
  await assignFolder("member_editor", "editor");
  expect(await created(await newProject(editor, "Allowed", folderId))).toMatchObject({ folderId });
  expect((await newProject(viewer, "Viewer", folderId)).status).toBe(403);
  expect(await created(await newProject(editor, "Unfiled"))).toMatchObject({ folderId: null });
});
