import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeMux } from "./support/fake-mux";
import { call, clearDatabase, expectRefused, seedMember, seedProject, seedRevision, seedVideo } from "./support/seed";
import { resultOf, serverFunctionIds as ids } from "./support/worker";

beforeEach(clearDatabase);
afterEach(() => vi.restoreAllMocks());

it.each(["removed_at = 1", "role = 'viewer'"])(
  "refuses writes when Access races %s",
  async (change) => {
    const owner = await seedMember("owner");
    await seedProject("p");
    await seedVideo("v", "p");
    await seedRevision({ id: "r", videoId: "v", uploadId: "u" });
    const invite = await resultOf<{ invite: { id: string } }>(await call(ids.createInvite, owner, { role: "editor" }));
    const actions = [
      [ids.createInvite, { role: "editor" }],
      [ids.revokeInvite, { id: invite.invite.id }],
      [ids.startUpload, { projectId: "p", title: "Forbidden" }],
      [ids.startUpload, { videoId: "v" }],
      [ids.renameVideo, { videoId: "v", title: "Forbidden" }],
      [ids.setVideoStatus, { videoId: "v", status: "done" }],
      [ids.createProject, { name: "Forbidden" }],
      [ids.renameProject, { projectId: "p", name: "Forbidden" }],
      [ids.cancelUpload, { revisionId: "r" }],
    ] as const;
    const create = vi.spyOn(fakeMux, "createDirectUpload");
    const cancel = vi.spyOn(fakeMux, "cancelDirectUpload");
    for (const [id, data] of actions) {
      await env.DB.exec("UPDATE members SET role = 'owner', removed_at = NULL");
      const batch = env.DB.batch.bind(env.DB);
      // Finish the actual Access read, then commit the competing request before its write.
      const spy = vi.spyOn(env.DB, "batch").mockImplementationOnce(async (statements) => {
        const result = await batch(statements);
        await env.DB.exec(`UPDATE members SET ${change}`);
        return result;
      });
      const response = await call(id, owner, data);
      spy.mockRestore();
      await expectRefused(response, id === ids.createInvite ? 403 : 404, id === ids.createInvite ? "insufficient-role" : "not-found");
    }
    expect(create).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    await env.DB.exec("UPDATE members SET role = 'owner', removed_at = NULL");
    const pending = await resultOf<{ invites: { id: string }[] }>(await call(ids.listInvites, owner));
    expect(pending.invites.map((row) => row.id)).toEqual([invite.invite.id]);
    const page = await resultOf<{ videos: { title: string; status: string; latestRevision: number | null }[]; projects: unknown[] }>(await call(ids.listProjects, owner));
    expect(page.projects).toHaveLength(1);
    expect(page.videos).toMatchObject([{ title: "Video v", status: "review", latestRevision: 1 }]);
  },
);

it("cancels Mux creation when the uploader loses Access while Mux is responding", async () => {
  const owner = await seedMember("owner");
  await seedProject("p");
  const create = fakeMux.createDirectUpload.bind(fakeMux);
  vi.spyOn(fakeMux, "createDirectUpload").mockImplementationOnce(async (input) => {
    await env.DB.exec("UPDATE members SET role = 'viewer'");
    return create(input);
  });
  const cancel = vi.spyOn(fakeMux, "cancelDirectUpload");
  await expectRefused(await call(ids.startUpload, owner, { projectId: "p", title: "Lost access" }), 404, "not-found");
  expect(cancel).toHaveBeenCalledOnce();
  await env.DB.exec("UPDATE members SET role = 'owner'");
  const page = await resultOf<{ videos: unknown[] }>(await call(ids.listProjects, owner));
  expect(page.videos).toEqual([]);
});
