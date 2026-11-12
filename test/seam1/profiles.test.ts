import { env } from "cloudflare:workers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readClerkProfile } from "@/server/clerk-profile";
import {
  call,
  clearDatabase,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
} from "./support/seed";
import { callServerFn, resultOf, serverFunctionIds as fn } from "./support/worker";

const avatarUrl = "https://img.clerk.com/editor-photo.png";

beforeEach(async () => {
  await clearDatabase();
  await seedMember("owner");
  await seedMember("editor");
  vi.mocked(readClerkProfile).mockClear();
});

afterEach(() => vi.mocked(readClerkProfile).mockReset());

it("refreshes only the caller's name and photo from Clerk and returns no Clerk IDs", async () => {
  vi.mocked(readClerkProfile).mockResolvedValue({ displayName: "Dana Editor", avatarUrl });
  const result = await resultOf(
    await call(fn.getAppShell, "user_editor", {
      clerkUserId: "user_owner",
      avatarUrl: "https://forged.example/photo.png",
    }),
  );
  expect(readClerkProfile).toHaveBeenCalledWith("user_editor");
  expect(result).toEqual({ member: { displayName: "Dana Editor", avatarUrl, role: "editor" } });
  expect(
    await env.DB.prepare("SELECT avatar_url FROM members WHERE id = 'member_editor'").first(
      "avatar_url",
    ),
  ).toBe(avatarUrl);
  expect(
    await env.DB.prepare("SELECT avatar_url FROM members WHERE id = 'member_owner'").first(
      "avatar_url",
    ),
  ).toBeNull();
  const list = await resultOf<{ members: { id: string; avatarUrl: string | null }[] }>(
    await call(fn.listMembers, "user_owner"),
  );
  expect(list.members.find(({ id }) => id === "member_editor")?.avatarUrl).toBe(avatarUrl);
});

it("keeps cached profiles when Clerk fails and clears a removed photo on a successful refresh", async () => {
  await env.DB.prepare("UPDATE members SET avatar_url = ? WHERE id = 'member_editor'")
    .bind(avatarUrl)
    .run();
  vi.mocked(readClerkProfile).mockRejectedValueOnce(new Error("Clerk unavailable"));
  expect(await resultOf(await call(fn.getAppShell, "user_editor"))).toEqual({
    member: { displayName: "editor", avatarUrl, role: "editor" },
  });
  vi.mocked(readClerkProfile).mockResolvedValueOnce({ displayName: null, avatarUrl: null });
  expect(await resultOf(await call(fn.getAppShell, "user_editor"))).toEqual({
    member: { displayName: "editor", avatarUrl: null, role: "editor" },
  });
});

it("does not fetch a profile for a non-member or a removed member", async () => {
  expect((await call(fn.getAppShell, "user_stranger")).status).toBe(403);
  await env.DB.prepare("UPDATE members SET removed_at = 1 WHERE id = 'member_editor'").run();
  expect((await call(fn.getAppShell, "user_editor")).status).toBe(403);
  expect(readClerkProfile).not.toHaveBeenCalled();
});

it("serves cached author photos to members and guests without revealing identity IDs", async () => {
  await env.DB.prepare("UPDATE members SET avatar_url = ? WHERE id = 'member_editor'")
    .bind(avatarUrl)
    .run();
  await seedProject("p");
  await seedVideo("v", "p");
  await seedRevision({ id: "r", videoId: "v", state: "ready", playbackId: "sample" });
  await env.DB.prepare("UPDATE revisions SET duration_ms = 8000").run();
  expect(
    (
      await call(fn.createComment, "user_editor", {
        videoId: "v",
        revisionId: "r",
        id: crypto.randomUUID(),
        body: "Check this cut",
        timecodeMs: 1000,
      })
    ).status,
  ).toBe(200);
  const { token } = await resultOf<{ token: string }>(
    await call(fn.createShareLink, "user_owner", {
      videoId: "v",
      name: "Client",
      permission: "comment",
    }),
  );
  expect(
    (
      await callServerFn(fn.createGuestComment, {
        data: {
          token,
          id: crypto.randomUUID(),
          name: "Client",
          body: "Looks good",
          timecodeMs: 2000,
        },
      })
    ).status,
  ).toBe(200);
  for (const response of [
    await call(fn.getReview, "user_owner", { videoId: "v" }),
    await callServerFn(fn.getGuestReview, { data: { token } }),
  ]) {
    const result = await resultOf<{
      comments: { authorAvatarUrl: string | null; isGuest: boolean }[];
    }>(response);
    expect(
      result.comments.map(({ authorAvatarUrl, isGuest }) => ({ authorAvatarUrl, isGuest })),
    ).toEqual([
      { authorAvatarUrl: avatarUrl, isGuest: false },
      { authorAvatarUrl: null, isGuest: true },
    ]);
    expect(JSON.stringify(result.comments)).not.toMatch(
      /user_editor|member_editor|clerkUserId|memberId|shareLinkId/,
    );
  }
  expect(readClerkProfile).not.toHaveBeenCalled();
});
