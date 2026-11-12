import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionToken, type Person } from "./support/clerk";
import {
  callServerFn,
  memberServerFunctionIds,
  ownerServerFunctionIds,
  resultOf,
  guestServerFunctionIds,
  serverFunctionIds,
} from "./support/worker";

const { getAppShell } = serverFunctionIds;
const guestIds: string[] = Object.values(guestServerFunctionIds);
const everyServerFunction = Object.entries(serverFunctionIds).filter(
  ([name, id]) => name !== "sendFeedback" && !guestIds.includes(id),
);
const memberServerFunctions = Object.entries(memberServerFunctionIds);
const ownerServerFunctions = Object.entries(ownerServerFunctionIds);

const firstOwner: Person = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
  emailVerified: true,
};
const stranger: Person = {
  clerkUserId: "user_stranger",
  email: "stranger@example.com",
  emailVerified: true,
};

const callAs = async (person: Person) =>
  callServerFn(getAppShell, { bearer: await sessionToken(person) });

const owners = async () =>
  (
    await env.DB.prepare("SELECT clerk_user_id FROM members WHERE role = 'owner'").all<{
      clerk_user_id: string;
    }>()
  ).results.map((row) => row.clerk_user_id);

async function seedMember(clerkUserId: string, removedAt: number | null = null, role = "viewer") {
  await env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES (?, ?, 'Seeded', ?, 1, ?)",
  )
    .bind(`id_${clerkUserId}`, clerkUserId, role, removedAt)
    .run();
}

async function expectRefused(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM members");
});

describe("first Owner", () => {
  it("is created by the first sign-in with the configured verified email", async () => {
    const response = await callAs(firstOwner);

    expect(response.status).toBe(200);
    expect(await resultOf(response)).toMatchObject({
      member: { role: "owner" },
    });
  });

  it("matches the configured email regardless of letter case", async () => {
    const response = await callAs({
      ...firstOwner,
      email: "First.Owner@Example.com",
    });

    expect(response.status).toBe(200);
  });

  it("is not created from an unverified email", async () => {
    await expectRefused(await callAs({ ...firstOwner, emailVerified: false }), 403, "not-a-member");
    expect(await owners()).toEqual([]);
  });

  it("is not created once an Owner exists", async () => {
    await callAs(firstOwner);

    await expectRefused(
      await callAs({ ...firstOwner, clerkUserId: "user_second_account" }),
      403,
      "not-a-member",
    );
    expect(await owners()).toEqual([firstOwner.clerkUserId]);
  });

  it("is created exactly once under simultaneous sign-ins", async () => {
    const responses = await Promise.all(
      ["a", "b", "c", "d"].map((suffix) =>
        callAs({ ...firstOwner, clerkUserId: `user_${suffix}` }),
      ),
    );

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(await owners()).toHaveLength(1);
  });

  it("keeps the same Owner on later sign-ins", async () => {
    await callAs(firstOwner);

    expect((await callAs(firstOwner)).status).toBe(200);
    expect(await owners()).toEqual([firstOwner.clerkUserId]);
  });
});

describe("refusals", () => {
  // Every server function must appear in serverFunctionIds, so each one is refused here.
  it.each(memberServerFunctions)("%s refuses a signed-in non-Member", async (_name, id) => {
    await expectRefused(
      await callServerFn(id, { bearer: await sessionToken(stranger) }),
      403,
      "not-a-member",
    );
  });

  it.each(everyServerFunction)("%s refuses a signed-out caller", async (_name, id) => {
    await expectRefused(await callServerFn(id), 401, "signed-out");
  });

  it.each(memberServerFunctions)("%s refuses a removed Member", async (_name, id) => {
    await seedMember(stranger.clerkUserId, 1000);

    await expectRefused(
      await callServerFn(id, { bearer: await sessionToken(stranger) }),
      403,
      "not-a-member",
    );
  });

  describe.each(["editor", "viewer"])("a %s", (role) => {
    it.each(ownerServerFunctions)("is refused by %s", async (_name, id) => {
      await seedMember(stranger.clerkUserId, null, role);

      await expectRefused(
        await callServerFn(id, { bearer: await sessionToken(stranger) }),
        403,
        "insufficient-role",
      );
    });
  });

  it("does not let a removed first Owner claim the Team again", async () => {
    await seedMember(firstOwner.clerkUserId, 1000, "owner");

    await expectRefused(await callAs(firstOwner), 403, "not-a-member");
    expect(await owners()).toEqual([firstOwner.clerkUserId]);
  });

  it("lists every server function in the source", () => {
    const sources = import.meta.glob<string>("/src/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const declared = Object.values(sources)
      .join("\n")
      .match(/createServerFn\(/g);

    expect(declared).toHaveLength(Object.keys(serverFunctionIds).length);
  });
});

describe("session handling", () => {
  it("accepts an expired cookie alongside a valid Bearer token", async () => {
    await seedMember(stranger.clerkUserId);
    const expired = await sessionToken(stranger, { expiresInSeconds: -300 });

    const response = await callServerFn(getAppShell, {
      cookie: `__session=${expired}`,
      bearer: await sessionToken(stranger),
    });

    expect(response.status).toBe(200);
  });

  it("treats an expired cookie alone as signed out", async () => {
    await seedMember(stranger.clerkUserId);
    const expired = await sessionToken(stranger, { expiresInSeconds: -300 });

    await expectRefused(
      await callServerFn(getAppShell, { cookie: `__session=${expired}` }),
      401,
      "signed-out",
    );
  });

  it("refuses a token issued for another origin", async () => {
    await seedMember(stranger.clerkUserId);

    await expectRefused(
      await callServerFn(getAppShell, {
        bearer: await sessionToken(stranger, { azp: "https://evil.test" }),
      }),
      401,
      "signed-out",
    );
  });

  it("refuses a cross-site server function call", async () => {
    await seedMember(stranger.clerkUserId);

    const response = await callServerFn(getAppShell, {
      bearer: await sessionToken(stranger),
      origin: "https://evil.test",
    });

    expect(response.status).toBe(403);
  });
});
