import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { sessionToken } from "./support/clerk";
import { callServerFn, resultOf, serverFunctionIds } from "./support/worker";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM projects; DELETE FROM invites; DELETE FROM members;");
  for (const role of ["owner", "editor", "viewer"]) {
    await env.DB.prepare(
      "INSERT INTO members (id,clerk_user_id,display_name,role,created_at) VALUES (?,?,?,?,1)",
    )
      .bind(role, `user_${role}`, role, role)
      .run();
  }
  await env.DB.exec(
    "INSERT INTO projects (id,name,created_by,created_at,updated_at) VALUES ('p','Project','owner',1,1); INSERT INTO videos (id,project_id,title,status,created_by,created_at,updated_at) VALUES ('own','p','Own','review','editor',1,1),('other','p','Other','review','owner',1,1);",
  );
});

const call = async (name: keyof typeof serverFunctionIds, role: string, data?: unknown) =>
  callServerFn(serverFunctionIds[name], {
    bearer: await sessionToken({ clerkUserId: `user_${role}` }),
    data,
  });

it("an Editor deletes only their own Video and it disappears immediately", async () => {
  expect((await call("deleteVideo", "editor", { videoId: "other" })).status).toBe(404);
  expect((await call("deleteVideo", "viewer", { videoId: "own" })).status).toBe(403);
  expect((await call("deleteVideo", "editor", { videoId: "own" })).status).toBe(200);
  const list = await resultOf<{ videos: { id: string }[] }>(await call("listProjects", "viewer"));
  expect(list.videos.map(({ id }) => id)).toEqual(["other"]);
  expect((await call("deleteVideo", "owner", { videoId: "other" })).status).toBe(200);
});

it("only Owners delete Projects, hiding their Videos and direct Project access", async () => {
  expect((await call("deleteProject", "editor", { projectId: "p" })).status).toBe(403);
  expect((await call("deleteProject", "owner", { projectId: "p" })).status).toBe(200);
  expect(await resultOf(await call("listProjects", "viewer"))).toMatchObject({
    projects: [],
    videos: [],
  });
  expect((await call("getProject", "owner", { projectId: "p" })).status).toBe(404);
});
