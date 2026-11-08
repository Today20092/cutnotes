import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionToken } from "./support/clerk";
import { callServerFn, resultOf, serverFunctionIds } from "./support/worker";

const { createProject, getProject, listProjects, renameProject } =
  serverFunctionIds;

type ProjectRow = { id: string; name: string };
type VideoRow = {
  id: string;
  title: string;
  projectName: string;
  status: string;
  latestRevision: number | null;
};
type ProjectList = {
  member: { role: string };
  projects: ProjectRow[];
  videos: VideoRow[];
};
type ProjectPage = {
  member: { role: string };
  project: ProjectRow;
  videos: VideoRow[];
};

async function seedMember(role: string, removedAt: number | null = null) {
  await env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES (?, ?, ?, ?, 1, ?)",
  )
    .bind(`member_${role}`, `user_${role}`, role, role, removedAt)
    .run();
  return `user_${role}`;
}

async function seedProject(
  id: string,
  overrides: { deletedAt?: number; completedAt?: number } = {},
) {
  await env.DB.prepare(
    "INSERT INTO projects (id, name, created_by, created_at, updated_at, completed_at, deleted_at) VALUES (?, ?, 'member_owner', 1, 1, ?, ?)",
  )
    .bind(
      id,
      `Project ${id}`,
      overrides.completedAt ?? null,
      overrides.deletedAt ?? null,
    )
    .run();
}

async function seedVideo(
  id: string,
  projectId: string,
  deletedAt: number | null = null,
) {
  await env.DB.prepare(
    "INSERT INTO videos (id, project_id, title, status, created_by, created_at, updated_at, deleted_at) VALUES (?, ?, ?, 'rework', 'member_owner', 1, 5, ?)",
  )
    .bind(id, projectId, `Video ${id}`, deletedAt)
    .run();
}

async function seedRevision(videoId: string, number: number) {
  await env.DB.prepare(
    "INSERT INTO revisions (id, video_id, number, state, uploaded_by, created_at) VALUES (?, ?, ?, 'ready', 'member_owner', 1)",
  )
    .bind(`${videoId}_${number}`, videoId, number)
    .run();
}

const call = async (id: string, clerkUserId: string, data?: unknown) =>
  callServerFn(id, { bearer: await sessionToken({ clerkUserId }), data });

/** Counts separate trips to D1: a batch is one, and so is any lone statement. */
function countDatabaseTrips() {
  const database = Object.getPrototypeOf(env.DB) as { batch: () => unknown };
  const statement = Object.getPrototypeOf(env.DB.prepare("SELECT 1")) as {
    all: () => unknown;
    first: () => unknown;
    raw: () => unknown;
    run: () => unknown;
  };
  const spies = [
    vi.spyOn(database, "batch"),
    vi.spyOn(statement, "all"),
    vi.spyOn(statement, "first"),
    vi.spyOn(statement, "raw"),
    vi.spyOn(statement, "run"),
  ];
  return () => spies.reduce((trips, spy) => trips + spy.mock.calls.length, 0);
}

async function expectRefused(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
}

const names = async () =>
  (
    await env.DB.prepare("SELECT name FROM projects ORDER BY name").all<{
      name: string;
    }>()
  ).results.map((row) => row.name);

beforeEach(async () => {
  await env.DB.exec("DELETE FROM projects");
  await env.DB.exec("DELETE FROM members");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permission matrix", () => {
  it.each(["owner", "editor", "viewer"])(
    "lets a %s list and open Projects",
    async (role) => {
      const owner = await seedMember("owner");
      const caller = role === "owner" ? owner : await seedMember(role);
      await seedProject("p1");

      expect((await call(listProjects, caller)).status).toBe(200);
      expect((await call(getProject, caller, { projectId: "p1" })).status).toBe(
        200,
      );
    },
  );

  it.each(["owner", "editor"])(
    "lets a %s create and rename a Project",
    async (role) => {
      const owner = await seedMember("owner");
      const caller = role === "owner" ? owner : await seedMember(role);
      await seedProject("p1");

      expect((await call(createProject, caller, { name: "New" })).status).toBe(
        200,
      );
      expect(
        (await call(renameProject, caller, { projectId: "p1", name: "Renamed" }))
          .status,
      ).toBe(200);
      expect(await names()).toEqual(["New", "Renamed"]);
    },
  );

  it("refuses a Viewer who forges a create or rename", async () => {
    await seedMember("owner");
    const viewer = await seedMember("viewer");
    await seedProject("p1");

    await expectRefused(
      await call(createProject, viewer, { name: "Nope" }),
      403,
      "insufficient-role",
    );
    await expectRefused(
      await call(renameProject, viewer, { projectId: "p1", name: "Nope" }),
      403,
      "insufficient-role",
    );
    expect(await names()).toEqual(["Project p1"]);
  });

  it("refuses a removed Editor who forges a write", async () => {
    const editor = await seedMember("editor", 1000);

    await expectRefused(
      await call(createProject, editor, { name: "Nope" }),
      403,
      "not-a-member",
    );
    expect(await names()).toEqual([]);
  });
});

describe("Project names", () => {
  it("trims what it stores", async () => {
    const owner = await seedMember("owner");

    await call(createProject, owner, { name: "  Episode 42  " });

    expect(await names()).toEqual(["Episode 42"]);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["over 120 characters", "x".repeat(121)],
    ["not text", 42],
  ])("refuses a name that is %s", async (_label, name) => {
    const owner = await seedMember("owner");
    await seedProject("p1");

    await expectRefused(
      await call(createProject, owner, { name }),
      400,
      "invalid-name",
    );
    await expectRefused(
      await call(renameProject, owner, { projectId: "p1", name }),
      400,
      "invalid-name",
    );
    expect(await names()).toEqual(["Project p1"]);
  });

  it("accepts a name of exactly 120 characters", async () => {
    const owner = await seedMember("owner");

    const response = await call(createProject, owner, {
      name: "x".repeat(120),
    });

    expect(response.status).toBe(200);
  });
});

describe("renaming a Project", () => {
  it.each([
    ["unknown", {}, "missing"],
    ["deleted", { deletedAt: 5 }, "p1"],
    ["Complete", { completedAt: 5 }, "p1"],
  ])("refuses a %s Project", async (_label, overrides, projectId) => {
    const owner = await seedMember("owner");
    await seedProject("p1", overrides);

    await expectRefused(
      await call(renameProject, owner, { projectId, name: "Later" }),
      404,
      "not-found",
    );
    expect(await names()).toEqual(["Project p1"]);
  });
});

describe("the project list", () => {
  it("lists a Project an Owner created", async () => {
    const owner = await seedMember("owner");

    expect(
      (await call(createProject, owner, { name: "Episode 42" })).status,
    ).toBe(200);

    const list = await resultOf<ProjectList>(await call(listProjects, owner));
    expect(list.member.role).toBe("owner");
    expect(list.projects.map((project) => project.name)).toEqual([
      "Episode 42",
    ]);
  });

  it("shows every live Video with its Project and latest Revision", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    await seedRevision("v1", 1);
    await seedRevision("v1", 3);
    await seedVideo("v2", "p1");

    const { videos } = await resultOf<ProjectList>(
      await call(listProjects, owner),
    );

    expect(videos).toHaveLength(2);
    expect(videos.find((video) => video.id === "v1")).toMatchObject({
      title: "Video v1",
      projectName: "Project p1",
      status: "rework",
      latestRevision: 3,
    });
    expect(videos.find((video) => video.id === "v2")?.latestRevision).toBeNull();
  });

  it("hides deleted Projects and Videos, and Videos of deleted Projects", async () => {
    const owner = await seedMember("owner");
    await seedProject("live");
    await seedProject("gone", { deletedAt: 5 });
    await seedVideo("kept", "live");
    await seedVideo("deleted", "live", 5);
    await seedVideo("orphaned", "gone");

    const list = await resultOf<ProjectList>(await call(listProjects, owner));

    expect(list.projects.map((project) => project.id)).toEqual(["live"]);
    expect(list.videos.map((video) => video.id)).toEqual(["kept"]);
  });

  it("reads everything, including the Member row, in one trip", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedVideo("v1", "p1");
    const bearer = await sessionToken({ clerkUserId: owner });
    const trips = countDatabaseTrips();

    expect((await callServerFn(listProjects, { bearer })).status).toBe(200);

    expect(trips()).toBe(1);
  });
});

describe("the Project page", () => {
  it("lists only that Project's live Videos", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    await seedProject("p2");
    await seedVideo("mine", "p1");
    await seedVideo("deleted", "p1", 5);
    await seedVideo("other", "p2");

    const page = await resultOf<ProjectPage>(
      await call(getProject, owner, { projectId: "p1" }),
    );

    expect(page.project.name).toBe("Project p1");
    expect(page.member.role).toBe("owner");
    expect(page.videos.map((video) => video.id)).toEqual(["mine"]);
  });

  it.each([
    ["unknown", "missing"],
    ["deleted", "gone"],
  ])("answers not found for a %s Project", async (_label, projectId) => {
    const owner = await seedMember("owner");
    await seedProject("gone", { deletedAt: 5 });

    await expectRefused(
      await call(getProject, owner, { projectId }),
      404,
      "not-found",
    );
  });

  it("reads everything, including the Member row, in one trip", async () => {
    const owner = await seedMember("owner");
    await seedProject("p1");
    const bearer = await sessionToken({ clerkUserId: owner });
    const trips = countDatabaseTrips();

    const response = await callServerFn(getProject, {
      bearer,
      data: { projectId: "p1" },
    });

    expect(response.status).toBe(200);
    expect(trips()).toBe(1);
  });
});
