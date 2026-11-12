import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import {
  call,
  clearDatabase,
  expectRefused,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { resultOf, serverFunctionIds as fn } from "./support/worker";

beforeEach(async () => {
  await clearDatabase();
  await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "r", videoId: "v", state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
});

it.each(["owner", "editor", "viewer"])(
  "a %s edits and deletes their own Comment, while only writers Resolve",
  async (role) => {
    const caller = role === "owner" ? "user_owner" : await seedMember(role);
    await call(fn.createComment, caller, input);
    expect((await call(fn.editComment, caller, { ...input, body: "Corrected" })).status).toBe(200);
    expect((await review()).comments[0]?.body).toBe("Corrected");
    const resolved = await call(fn.resolveComment, caller, { ...input, resolved: true });
    if (role === "viewer") await expectRefused(resolved, 404, "not-found");
    else {
      expect(resolved.status).toBe(200);
      expect((await review()).comments[0]?.resolvedAt).toEqual(expect.any(Number));
      expect((await call(fn.resolveComment, caller, { ...input, resolved: false })).status).toBe(
        200,
      );
      expect((await review()).comments[0]?.resolvedAt).toBeNull();
    }
    expect((await call(fn.deleteComment, caller, input)).status).toBe(200);
    expect((await review()).comments).toEqual([]);
  },
);

const input = {
  videoId: "v",
  revisionId: "r",
  id: "browser-id",
  body: "Fix the cut",
  timecodeMs: 1200,
};
type Review = {
  comments: { id: string; body: string; authorName: string; resolvedAt: number | null }[];
};
const review = async (revisionId = "r") =>
  resultOf<Review>(await call(fn.getReview, "user_owner", { videoId: "v", revisionId }));

it("persists a drawing-only Comment and keeps its Drawing when editing text", async () => {
  const drawing = [
    {
      tool: "arrow",
      color: "#f87171",
      pts: [
        [0.25, 0.5],
        [0.75, 1],
      ],
    },
  ];
  expect((await call(fn.createComment, "user_owner", { ...input, body: "", drawing })).status).toBe(
    200,
  );
  expect((await review()).comments).toMatchObject([{ body: "", drawing }]);
  expect((await call(fn.editComment, "user_owner", { ...input, body: "Text added" })).status).toBe(
    200,
  );
  expect((await review()).comments).toMatchObject([{ body: "Text added", drawing }]);
  expect((await call(fn.editComment, "user_owner", { ...input, body: "" })).status).toBe(200);
});

const pen = {
  tool: "pen",
  color: "#f87171",
  pts: [
    [0, 0],
    [1, 1],
  ],
};
it.each([
  [],
  "not shapes",
  [{ ...pen, tool: "script" }],
  [{ ...pen, color: "url(https://evil.test)" }],
  [{ ...pen, pts: [[-0.1, 0]] }],
  [{ ...pen, pts: [[0, 1.1]] }],
  [{ ...pen, pts: [["0", 1]] }],
  [{ ...pen, pts: [[0]] }],
  [{ ...pen, pts: [] }],
  [{ ...pen, tool: "box", pts: [[0, 0]] }],
  Array.from({ length: 51 }, () => pen),
  [{ ...pen, pts: Array.from({ length: 2001 }, () => [0, 0]) }],
  [{ ...pen, extra: "💥".repeat(17000) }],
])("refuses forged Drawing payload %j", async (drawing) => {
  await expectRefused(
    await call(fn.createComment, "user_owner", { ...input, drawing }),
    400,
    "invalid-request",
  );
  expect((await review()).comments).toEqual([]);
});

it.each([
  ["createComment", { ...input, id: 7 }],
  ["createComment", { ...input, id: "x".repeat(129) }],
  ["createComment", { ...input, timecodeMs: null }],
  ["createComment", { ...input, timecodeMs: 1.5 }],
  ["createComment", { ...input, body: 5 }],
  ["editComment", { ...input, videoId: "" }],
  ["resolveComment", { ...input, resolved: "yes" }],
  ["deleteComment", { ...input, revisionId: null }],
] as const)("refuses forged %s input %j", async (name, data) => {
  await expectRefused(await call(fn[name], "user_owner", data), 400, "invalid-request");
  expect((await review()).comments).toEqual([]);
});

it("accepts exact shape and point caps and retries without replacing the Drawing", async () => {
  const drawing = Array.from({ length: 50 }, () => ({
    ...pen,
    pts: Array.from({ length: 40 }, () => [0.5, 0.5]),
  }));
  expect((await call(fn.createComment, "user_owner", { ...input, drawing })).status).toBe(200);
  expect((await call(fn.createComment, "user_owner", { ...input, drawing: [pen] })).status).toBe(
    200,
  );
  expect((await review()).comments).toMatchObject([{ drawing }]);
});

it("measures the serialized Drawing in UTF-8 bytes at the exact 64 KB boundary", async () => {
  const shape = { ...pen, padding: "" };
  shape.padding = "x".repeat(65536 - new TextEncoder().encode(JSON.stringify([shape])).byteLength);
  expect((await call(fn.createComment, "user_owner", { ...input, drawing: [shape] })).status).toBe(
    200,
  );
  await expectRefused(
    await call(fn.createComment, "user_owner", {
      ...input,
      id: "too-large",
      drawing: [{ ...shape, padding: shape.padding + "x" }],
    }),
    400,
    "invalid-request",
  );
});

it.each(["owner", "editor", "viewer"])(
  "a %s can persist a Drawing but cannot draw on a Complete Project",
  async (role) => {
    const caller = role === "owner" ? "user_owner" : await seedMember(role);
    expect((await call(fn.createComment, caller, { ...input, drawing: [pen] })).status).toBe(200);
    await env.DB.exec("UPDATE projects SET completed_at = 1");
    await expectRefused(
      await call(fn.createComment, caller, { ...input, id: "complete", drawing: [pen] }),
      400,
      "invalid-request",
    );
  },
);

it("a Member writes a timestamped Comment and retries the browser ID without duplicating or overwriting it", async () => {
  const viewer = await seedMember("viewer");
  expect((await call(fn.createComment, viewer, input)).status).toBe(200);
  expect((await call(fn.createComment, viewer, { ...input, body: "Retry" })).status).toBe(200);
  expect((await review()).comments).toMatchObject([
    { id: input.id, body: input.body, authorName: "viewer", resolvedAt: null },
  ]);
});

it.each(["editor", "viewer"])(
  "forged %s calls cannot edit/delete another Member's Comment or steal its ID",
  async (role) => {
    const caller = await seedMember(role);
    await call(fn.createComment, "user_owner", input);
    for (const action of [fn.editComment, fn.deleteComment]) {
      await expectRefused(
        await call(action, caller, { ...input, body: "Forged", memberId: "member_owner" }),
        404,
        "not-found",
      );
    }
    await expectRefused(await call(fn.createComment, caller, input), 400, "invalid-request");
    expect((await review()).comments).toMatchObject([{ body: input.body, authorName: "owner" }]);
  },
);

it("an Owner deletes another's Comment, but cannot edit it, and removed authors keep their name", async () => {
  const viewer = await seedMember("viewer");
  await call(fn.createComment, viewer, input);
  await env.DB.prepare("UPDATE members SET removed_at = 1 WHERE role = 'viewer'").run();
  expect((await review()).comments).toMatchObject([{ authorName: "viewer" }]);
  await expectRefused(
    await call(fn.editComment, "user_owner", { ...input, body: "Forged" }),
    404,
    "not-found",
  );
  expect((await call(fn.deleteComment, "user_owner", input)).status).toBe(200);
  expect((await review()).comments).toEqual([]);
});

it.each(["owner", "editor"])(
  "a %s Resolves and unresolves another Member's Comment",
  async (role) => {
    const viewer = await seedMember("viewer");
    const caller = role === "owner" ? "user_owner" : await seedMember(role);
    await call(fn.createComment, viewer, input);
    expect((await call(fn.resolveComment, caller, { ...input, resolved: true })).status).toBe(200);
    expect((await review()).comments[0]?.resolvedAt).toEqual(expect.any(Number));
    expect((await call(fn.resolveComment, caller, { ...input, resolved: false })).status).toBe(200);
    expect((await review()).comments[0]?.resolvedAt).toBeNull();
  },
);

it("forged edit bodies and non-boolean Resolve values leave the Comment unchanged", async () => {
  await call(fn.createComment, "user_owner", input);
  for (const body of ["", " ", "x".repeat(5001), 17]) {
    await expectRefused(
      await call(fn.editComment, "user_owner", { ...input, body }),
      400,
      "invalid-request",
    );
  }
  await expectRefused(
    await call(fn.resolveComment, "user_owner", { ...input, resolved: "false" }),
    400,
    "invalid-request",
  );
  expect((await review()).comments).toMatchObject([{ body: input.body, resolvedAt: null }]);
});

it.each([
  { body: "" },
  { body: "  " },
  { body: "x".repeat(5001) },
  { body: 123 },
  { timecodeMs: -1 },
  { timecodeMs: 8001 },
  { timecodeMs: 1.5 },
  { timecodeMs: "1" },
  { revisionId: "wrong" },
  { videoId: "wrong" },
  { id: "" },
])("refuses invalid or forged Comment input %j", async (change) => {
  await expectRefused(
    await call(fn.createComment, "user_owner", { ...input, ...change }),
    400,
    "invalid-request",
  );
  expect((await review()).comments).toEqual([]);
});

it("accepts the exact body and duration boundaries and concurrent retries create one Comment", async () => {
  const data = { ...input, body: "x".repeat(5000), timecodeMs: 8000 };
  const responses = await Promise.all(
    [1, 2, 3].map(() => call(fn.createComment, "user_owner", data)),
  );
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
  expect((await review()).comments).toHaveLength(1);
});

it("keeps Comments on their Revision and rejects a Revision belonging to another Video", async () => {
  await call(fn.createComment, "user_owner", input);
  await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
  expect((await review("r2")).comments).toEqual([]);
  await seedVideo("v2", "p");
  await expectRefused(
    await call(fn.createComment, "user_owner", { ...input, videoId: "v2" }),
    400,
    "invalid-request",
  );
  await expectRefused(
    await call(fn.editComment, "user_owner", { ...input, revisionId: "r2" }),
    404,
    "not-found",
  );
  expect((await review()).comments).toHaveLength(1);
});

it.each(["complete", "deleted-project", "deleted-video"])(
  "%s refuses every Comment write including retries",
  async (state) => {
    await call(fn.createComment, "user_owner", input);
    await env.DB.exec(
      state === "complete"
        ? "UPDATE projects SET completed_at = 1"
        : state === "deleted-project"
          ? "UPDATE projects SET deleted_at = 1"
          : "UPDATE videos SET deleted_at = 1",
    );
    await expectRefused(await call(fn.createComment, "user_owner", input), 400, "invalid-request");
    for (const action of [fn.editComment, fn.deleteComment, fn.resolveComment]) {
      await expectRefused(
        await call(action, "user_owner", { ...input, resolved: true }),
        404,
        "not-found",
      );
    }
  },
);
