import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shareMeta } from "@/lib/share-preview";
import {
  call,
  clearDatabase,
  expectRefused,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { callServerFn, fetchPath, resultOf, serverFunctionIds as fn } from "./support/worker";

type Link = { id: string; token: string; name: string; permission: "view" | "comment" };
type GuestPage = {
  title: string;
  permission: string;
  revision: { id: string; number: number; durationMs: number };
  playback: { videoUrl: string };
  comments: { id: string; body: string; authorName: string; isGuest: boolean }[];
};

afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  await clearDatabase();
  await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "r1", videoId: "v", state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
});

const createLink = async (permission: "view" | "comment" = "comment", caller = "user_owner") =>
  resultOf<Link>(
    await call(fn.createShareLink, caller, { videoId: "v", name: "Client", permission }),
  );
const guest = (token: string, extra: object = {}) =>
  callServerFn(fn.getGuestReview, { data: { token, ...extra } });
const page = async (token: string, extra: object = {}) =>
  resultOf<GuestPage>(await guest(token, extra));

it("previews a shared video without issuing playback credentials and hides revoked details", async () => {
  const link = await createLink("view");
  const preview = () => callServerFn(fn.getSharePreview, { data: { token: link.token } });
  const result = await resultOf<{ title: string; description: string; image: string }>(
    await preview(),
  );
  expect(result.title).toBe("View Video v");
  expect(result.description).toContain("Project p");
  expect(result.description).toContain("View only");
  expect(JSON.stringify(result)).not.toContain("stream.mux.com");
  expect(shareMeta(result, "Unavailable")).toContainEqual({
    property: "og:title",
    content: "View Video v",
  });
  expect(shareMeta(result, "Unavailable")).toContainEqual({
    property: "og:image",
    content: "https://cutnotes.test/logo.png",
  });
  const html = await (await fetchPath(`/share/${link.token}`)).text();
  expect(html).toContain('property="og:title" content="View Video v"');
  expect(html).toContain('property="og:image" content="https://cutnotes.test/logo.png"');
  await call(fn.revokeShareLink, "user_owner", { id: link.id });
  expect(await resultOf(await preview())).toBeNull();
});

it("an Owner creates a link with a 32-character base62 token and a Guest watches the latest ready Revision", async () => {
  await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
  await seedRevision({ id: "r3", videoId: "v", number: 3, state: "processing" });
  const link = await createLink();
  expect(link.token).toMatch(/^[0-9A-Za-z]{32}$/);
  const result = await page(link.token);
  expect(result).toMatchObject({
    title: "Video v",
    permission: "comment",
    revision: { id: "r2", number: 2 },
  });
  expect(result.playback.videoUrl).toContain("stream.mux.com/sample.m3u8");
});

const comment = (token: string, extra: object = {}, address?: string) =>
  callServerFn(fn.createGuestComment, {
    address,
    data: {
      token,
      id: crypto.randomUUID(),
      name: "Dana",
      body: "Too dark",
      timecodeMs: 1000,
      ...extra,
    },
  });
const expectDead = async (response: Response) => {
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "not-found" });
};

it.each(["owner", "editor"])(
  "a %s lists and revokes links; revoked links stop reads and Comments but stay out of the list",
  async (role) => {
    const caller = role === "owner" ? "user_owner" : await seedMember(role);
    const link = await createLink("comment", caller);
    expect(
      (await resultOf<{ links: Link[] }>(await call(fn.listShareLinks, caller, { videoId: "v" })))
        .links,
    ).toMatchObject([{ id: link.id, token: link.token, name: "Client" }]);
    expect((await call(fn.revokeShareLink, caller, { id: link.id })).status).toBe(200);
    expect(
      (await resultOf<{ links: Link[] }>(await call(fn.listShareLinks, caller, { videoId: "v" })))
        .links,
    ).toEqual([]);
    await expectDead(await guest(link.token));
    await expectDead(await comment(link.token));
  },
);

it("Viewers, non-Members, removed Members and Guests cannot manage links", async () => {
  const link = await createLink();
  const viewer = await seedMember("viewer");
  const removed = await seedMember("editor", 1);
  const data = { videoId: "v", name: "x", permission: "view", id: link.id };
  for (const action of [fn.createShareLink, fn.listShareLinks, fn.revokeShareLink]) {
    await expectRefused(await call(action, viewer, data), 403, "insufficient-role");
    await expectRefused(await call(action, removed, data), 403, "not-a-member");
    await expectRefused(await call(action, "user_stranger", data), 403, "not-a-member");
    await expectRefused(
      await callServerFn(action, { data: { ...data, token: link.token } }),
      401,
      "signed-out",
    );
  }
});

it("a Guest cannot reach any Member function with only a token", async () => {
  const link = await createLink();
  for (const action of [
    fn.getReview,
    fn.listProjects,
    fn.createComment,
    fn.resolveComment,
    fn.editComment,
    fn.deleteComment,
  ]) {
    await expectRefused(
      await callServerFn(action, {
        data: { token: link.token, videoId: "v", revisionId: "r1", id: "x" },
      }),
      401,
      "signed-out",
    );
  }
});

it("a comment link accepts a Comment with a Guest badge, and a retry does not duplicate it", async () => {
  const link = await createLink();
  const id = "guest-comment";
  expect((await comment(link.token, { id, name: "  Dana  " })).status).toBe(200);
  expect((await comment(link.token, { id, body: "Retry" })).status).toBe(200);
  expect((await page(link.token)).comments).toMatchObject([
    { id, body: "Too dark", authorName: "Dana", isGuest: true },
  ]);
});

it("a view link plays and shows existing Comments, while every write is refused", async () => {
  const commenter = await createLink();
  await comment(commenter.token);
  const link = await createLink("view");
  expect((await page(link.token)).comments).toHaveLength(1);
  await expectRefused(await comment(link.token), 403, "insufficient-role");
  expect((await page(link.token)).comments).toHaveLength(1);
});

it("a Revision or Video ID in the request is ignored", async () => {
  await seedProject("other");
  await seedVideo("v2", "other");
  await seedRevision({ id: "other-r", videoId: "v2", state: "ready", playbackId: "secret" });
  await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
  const link = await createLink();
  const forged = { videoId: "v2", revisionId: "r1" };
  expect((await page(link.token, forged)).revision.id).toBe("r2");
  expect((await comment(link.token, { ...forged, id: "c" })).status).toBe(200);
  expect(
    await env.DB.prepare("SELECT revision_id FROM comments WHERE id = 'c'").first("revision_id"),
  ).toBe("r2");
});

it("the link moves to a new Revision once it is ready", async () => {
  const link = await createLink();
  expect((await page(link.token)).revision.id).toBe("r1");
  await seedRevision({ id: "r2", videoId: "v", number: 2, state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
  expect((await page(link.token)).revision.id).toBe("r2");
});

it("unknown, malformed, not-ready, Complete and deleted links all answer identically, and Reopen restores", async () => {
  const link = await createLink();
  await expectDead(await guest("0".repeat(32)));
  await expectDead(await guest("nope"));
  await env.DB.prepare("UPDATE revisions SET state = 'processing'").run();
  await expectDead(await guest(link.token));
  await env.DB.prepare("UPDATE revisions SET state = 'ready'").run();
  await env.DB.prepare("UPDATE projects SET completed_at = 1").run();
  await expectDead(await guest(link.token));
  await expectDead(await comment(link.token));
  await env.DB.prepare("UPDATE projects SET completed_at = NULL").run();
  expect((await guest(link.token)).status).toBe(200);
  await env.DB.prepare("UPDATE videos SET deleted_at = 1").run();
  await expectDead(await guest(link.token));
  await env.DB.prepare("UPDATE videos SET deleted_at = NULL").run();
  await env.DB.prepare("UPDATE projects SET deleted_at = 1").run();
  await expectDead(await guest(link.token));
});

it.each([
  ["empty name", { name: "   " }],
  ["long name", { name: "n".repeat(61) }],
  ["empty body", { body: " " }],
  ["long body", { body: "b".repeat(5001) }],
  ["timecode past the end", { timecodeMs: 8001 }],
  ["negative timecode", { timecodeMs: -1 }],
])("a Guest Comment with %s is refused", async (_case, extra) => {
  await expectRefused(await comment((await createLink()).token, extra), 400, "invalid-request");
});

it("the 31st Comment in a minute on one link is refused with a retry response", async () => {
  const { token } = await createLink();
  for (let index = 0; index < 30; index++) expect((await comment(token)).status).toBe(200);
  await expectRefused(await comment(token), 429, "rate-limited");
});

it("one client address over its limit is refused", async () => {
  const { token } = await createLink();
  const address = "203.0.113.9";
  // Exhausting a real counter can cross its minute boundary and reset mid-test.
  const limit = vi.spyOn(env.SHARE_ADDRESS_LIMIT, "limit").mockImplementation(async ({ key }) => ({
    success: key !== address,
  }));
  await expectRefused(
    await callServerFn(fn.getGuestReview, { address, data: { token: "x" } }),
    429,
    "rate-limited",
  );
  await expectRefused(await comment(token, {}, address), 429, "rate-limited");
  expect(limit).toHaveBeenNthCalledWith(1, { key: address });
  expect(limit).toHaveBeenNthCalledWith(2, { key: address });
  expect(
    (await callServerFn(fn.getGuestReview, { address: "203.0.113.10", data: { token } })).status,
  ).toBe(200);
  expect(limit).toHaveBeenNthCalledWith(3, { key: "203.0.113.10" });
  expect((await guest(token)).status).toBe(200);
});

it("Guest responses carry no Clerk or Member IDs", async () => {
  await call(fn.createComment, "user_owner", {
    videoId: "v",
    revisionId: "r1",
    id: "m",
    body: "Member note",
    timecodeMs: 1,
  });
  const { token } = await createLink();
  await comment(token);
  const text = await (await guest(token)).text();
  expect(text).toContain("Member note");
  expect(text).not.toMatch(/member_owner|user_owner|memberId|clerk|shareLinkId/i);
});

it("share pages send no-referrer and noindex", async () => {
  const response = await fetchPath("/share/anything");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-robots-tag")).toBe("noindex");
});

it("a link cannot be created with a bad name or permission, or for a Complete Project", async () => {
  const send = (extra: object) =>
    call(fn.createShareLink, "user_owner", {
      videoId: "v",
      name: "Client",
      permission: "view",
      ...extra,
    });
  await expectRefused(await send({ name: " " }), 400, "invalid-request");
  await expectRefused(await send({ name: "n".repeat(61) }), 400, "invalid-request");
  await expectRefused(await send({ permission: "admin" }), 400, "invalid-request");
  await env.DB.prepare("UPDATE projects SET completed_at = 1").run();
  await expectRefused(await send({}), 404, "not-found");
});

it("a Guest Comment carries a Drawing and is refused over the Drawing caps", async () => {
  const { token } = await createLink();
  const pts = [
    [0.1, 0.1],
    [0.5, 0.5],
  ];
  expect(
    (
      await comment(token, {
        id: "drawn",
        body: "",
        drawing: [{ tool: "arrow", color: "#ffffff", pts }],
      })
    ).status,
  ).toBe(200);
  expect((await page(token)).comments).toMatchObject([{ id: "drawn" }]);
  const tooMany = Array.from({ length: 51 }, () => ({ tool: "arrow", color: "#ffffff", pts }));
  await expectRefused(await comment(token, { drawing: tooMany }), 400, "invalid-request");
});
it("a Guest name is trimmed, may be 60 characters, and is never an identity", async () => {
  const { token } = await createLink();
  const longest = "n".repeat(60);
  expect((await comment(token, { id: "longest", name: `  ${longest}  ` })).status).toBe(200);
  expect((await comment(token, { id: "first", name: "owner", timecodeMs: 2000 })).status).toBe(200);
  expect((await comment(token, { id: "second", name: "owner", timecodeMs: 3000 })).status).toBe(
    200,
  );
  expect(
    (
      await comment(token, {
        id: "first",
        name: "Someone else",
        body: "Taken over",
        timecodeMs: 2000,
      })
    ).status,
  ).toBe(200);
  expect((await page(token)).comments).toMatchObject([
    { id: "longest", authorName: longest, isGuest: true },
    { id: "first", authorName: "owner", body: "Too dark", isGuest: true },
    { id: "second", authorName: "owner", isGuest: true },
  ]);
});
it("a Member who shares a Guest's name cannot edit the Guest's Comment, and an Owner can delete it", async () => {
  const { token } = await createLink();
  await comment(token, { id: "guest", name: "owner" });
  const target = { videoId: "v", revisionId: "r1", id: "guest", timecodeMs: 1000 };
  await expectRefused(
    await call(fn.editComment, "user_owner", { ...target, body: "Forged" }),
    404,
    "not-found",
  );
  expect((await call(fn.deleteComment, "user_owner", target)).status).toBe(200);
  expect((await page(token)).comments).toEqual([]);
});
it("revoking after a token was issued refuses new playback requests", async () => {
  const link = await createLink();
  const issued = (await page(link.token)).playback.videoUrl;
  expect(issued).toContain("token=fake.v.sample");
  await call(fn.revokeShareLink, "user_owner", { id: link.id });
  await expectDead(await guest(link.token));
});

it("Members and Guests receive the same Comment shape, without Member IDs for the Guest", async () => {
  const drawing = [
    {
      tool: "box",
      color: "#ffffff",
      pts: [
        [0.1, 0.1],
        [0.5, 0.5],
      ],
    },
  ];
  const input = {
    videoId: "v",
    revisionId: "r1",
    id: "c1",
    body: "Trim",
    timecodeMs: 900,
    drawing,
  };
  expect((await call(fn.createComment, "user_owner", input)).status).toBe(200);
  const { token } = await createLink();
  const member = await resultOf<{ comments: object[] }>(
    await call(fn.getReview, "user_owner", { videoId: "v" }),
  );
  const shared = (await page(token)).comments;
  const { mine, ...rest } = member.comments[0] as { mine: boolean };
  expect(mine).toBe(true);
  expect(shared).toEqual([rest]);
  expect(rest).toMatchObject({ drawing, isGuest: false, authorName: "owner" });
  expect(Object.keys(rest).sort()).toEqual([
    "authorName",
    "body",
    "createdAt",
    "drawing",
    "id",
    "isGuest",
    "resolvedAt",
    "timecodeMs",
  ]);
});
