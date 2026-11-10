import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  call,
  clearDatabase,
  expectRefused,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { serverFunctionIds } from "./support/worker";

const { getAppShell, getProject, listInvites, listMembers, listProjects } = serverFunctionIds;

/** Every way a Worker can reach D1: one call to any of these is one database trip. */
function watchD1Trips() {
  const statement = Object.getPrototypeOf(env.DB.prepare("SELECT 1")) as D1PreparedStatement;
  const spies = [
    vi.spyOn(env.DB, "batch"),
    vi.spyOn(env.DB, "exec"),
    vi.spyOn(statement, "all"),
    vi.spyOn(statement, "first"),
    vi.spyOn(statement, "raw"),
    vi.spyOn(statement, "run"),
  ];
  return () => spies.reduce((trips, spy) => trips + spy.mock.calls.length, 0);
}

const screens = [
  ["getReview", serverFunctionIds.getReview, { videoId: "video_one" }],
  ["getReview unavailable", serverFunctionIds.getReview, { videoId: "missing" }],
  ["getAppShell", getAppShell, undefined],
  ["listProjects", listProjects, undefined],
  ["getProject", getProject, { projectId: "project_one" }],
  ["listMembers", listMembers, undefined],
  ["listInvites", listInvites, undefined],
] as const;

describe("a screen's reads", () => {
  let owner: string;

  beforeEach(async () => {
    await clearDatabase();
    owner = await seedMember("owner");
    await seedProject("project_one");
    await seedVideo("video_one", "project_one");
    await seedRevision({
      id: "revision_one",
      videoId: "video_one",
      state: "ready",
      playbackId: "sample",
    });
    await env.DB.exec("UPDATE revisions SET duration_ms = 8000");
    await call(serverFunctionIds.createComment, owner, {
      id: "comment",
      videoId: "video_one",
      revisionId: "revision_one",
      body: "Feedback",
      timecodeMs: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(screens)("%s takes one D1 trip", async (_name, id, data) => {
    const trips = watchD1Trips();

    const response = await call(id, owner, data);

    expect(response.status).toBe(200);
    expect(trips()).toBe(1);
  });

  it("takes one D1 trip to refuse a caller without the Role", async () => {
    const editor = await seedMember("editor");
    const trips = watchD1Trips();

    await expectRefused(await call(listInvites, editor), 403, "insufficient-role");

    expect(trips()).toBe(1);
  });
});
