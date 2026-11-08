import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionToken, type Person } from "./support/clerk";
import { callServerFn, resultOf, serverFunctionIds } from "./support/worker";

const { createInvite, getAppShell, listInvites, redeemInvite, revokeInvite } =
  serverFunctionIds;

const owner: Person = { clerkUserId: "user_owner", email: "owner@example.com" };
const newcomer: Person = { clerkUserId: "user_new", email: "new@example.com" };

type Pending = { id: string; role: string; expiresAt: number };

const DAY = 24 * 60 * 60 * 1000;

const call = async (id: string, person: Person, data?: unknown) =>
  callServerFn(id, { bearer: await sessionToken(person), data });

async function seedMember(person: Person, role: string, removedAt: number | null = null) {
  await env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES (?, ?, 'Seeded', ?, 1, ?)",
  )
    .bind(`id_${person.clerkUserId}`, person.clerkUserId, role, removedAt)
    .run();
}

async function invite(role = "editor") {
  const response = await call(createInvite, owner, { role });
  expect(response.status).toBe(200);
  return resultOf<{ url: string; invite: Pending }>(response);
}

const tokenOf = (url: string) => url.split("/").pop() as string;

const redeem = async (token: string, person: Person = newcomer) =>
  resultOf<{ outcome: string; reason?: string }>(
    await call(redeemInvite, person, { token }),
  );

const roleOf = async (person: Person) => {
  const response = await call(getAppShell, person);
  if (response.status !== 200) return response.status;
  const { member } = await resultOf<{ member: { role: string } }>(response);
  return member.role;
};

const pending = async () =>
  resultOf<{ invites: Pending[] }>(await call(listInvites, owner)).then(
    (result) => result.invites,
  );

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM invites"),
    env.DB.prepare("DELETE FROM members"),
  ]);
  await seedMember(owner, "owner");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("creating an Invite", () => {
  it("gives an Owner a link on this site, valid for 7 days", async () => {
    const before = Date.now();

    const { url, invite: created } = await invite("viewer");

    expect(url).toMatch(/^https:\/\/cutnotes\.test\/invite\/[\w-]{43}$/);
    expect(created.role).toBe("viewer");
    expect(created.expiresAt).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(created.expiresAt).toBeLessThanOrEqual(Date.now() + 7 * DAY);
  });

  it("stores only the SHA-256 hash of the token", async () => {
    const { url } = await invite();
    const token = url.split("/").pop() as string;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    const expected = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const row = await env.DB.prepare("SELECT * FROM invites").first();

    expect(row?.token_hash).toBe(expected);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it.each([{ role: "admin" }, { role: 7 }, {}])(
    "refuses the forged input %j",
    async (data) => {
      const response = await call(createInvite, owner, data);

      expect(response.status).toBe(400);
      expect(await pending()).toEqual([]);
    },
  );
});

describe("listing pending Invites", () => {
  it("shows pending Invites and never the token or its hash", async () => {
    const { url, invite: created } = await invite();

    const response = await call(listInvites, owner);
    const text = await response.clone().text();

    expect((await resultOf<{ invites: Pending[] }>(response)).invites).toEqual([
      expect.objectContaining({ id: created.id, role: "editor" }),
    ]);
    expect(text).not.toContain(url.split("/").pop());
    expect(text).not.toContain("tokenHash");
  });
});

describe("revoking an Invite", () => {
  it("removes it from the pending list", async () => {
    const { invite: created } = await invite();

    const response = await call(revokeInvite, owner, { id: created.id });

    expect(response.status).toBe(200);
    expect(await pending()).toEqual([]);
  });

  it("refuses a request that names no Invite", async () => {
    expect((await call(revokeInvite, owner, {})).status).toBe(400);
  });
});

describe("redeeming an Invite", () => {
  it("makes the signed-in person a Member with the chosen Role and uses it up", async () => {
    const { url } = await invite("editor");

    expect(await redeem(tokenOf(url))).toEqual({
      outcome: "joined",
    });

    expect(await roleOf(newcomer)).toBe("editor");
    expect(await pending()).toEqual([]);
  });

  it("lets exactly one of several simultaneous redemptions win", async () => {
    const { url } = await invite("viewer");
    const people = ["a", "b", "c", "d"].map((suffix) => ({
      clerkUserId: `user_${suffix}`,
      email: `${suffix}@example.com`,
    }));

    const outcomes = await Promise.all(
      people.map((person) => redeem(tokenOf(url), person)),
    );

    expect(outcomes.filter((result) => result.outcome === "joined")).toHaveLength(1);
    const memberCount = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM members WHERE role = 'viewer'",
    ).first<number>("total");
    expect(memberCount).toBe(1);
  });

  it("refuses a used Invite and leaves the second person out", async () => {
    const { url } = await invite();
    await redeem(tokenOf(url));
    const second = { clerkUserId: "user_second", email: "second@example.com" };

    expect(await redeem(tokenOf(url), second)).toEqual({
      outcome: "unavailable",
      reason: "used",
    });
    expect(await roleOf(second)).toBe(403);
  });

  it("refuses a revoked Invite", async () => {
    const { url, invite: created } = await invite();
    await call(revokeInvite, owner, { id: created.id });

    expect(await redeem(tokenOf(url))).toEqual({
      outcome: "unavailable",
      reason: "revoked",
    });
    expect(await roleOf(newcomer)).toBe(403);
  });

  it("refuses an unknown token", async () => {
    expect(await redeem("not-a-real-token")).toEqual({
      outcome: "unavailable",
      reason: "unknown",
    });
  });

  it("refuses a forged request with no token", async () => {
    expect((await call(redeemInvite, newcomer, {})).status).toBe(400);
  });

  describe("at the 7-day limit", () => {
    const start = new Date("2026-11-01T12:00:00Z").getTime();

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"], now: start });
    });

    it("still works one millisecond before", async () => {
      const { url } = await invite();

      vi.setSystemTime(start + 7 * DAY - 1);

      expect((await redeem(tokenOf(url))).outcome).toBe("joined");
    });

    it("is expired at exactly the boundary", async () => {
      const { url } = await invite();

      vi.setSystemTime(start + 7 * DAY);

      expect(await redeem(tokenOf(url))).toEqual({
        outcome: "unavailable",
        reason: "expired",
      });
      expect(await roleOf(newcomer)).toBe(403);
      expect(await pending()).toEqual([]);
    });
  });

  describe("by someone already on the Team", () => {
    it("tells an existing Member so and leaves the Invite usable", async () => {
      const { url } = await invite("owner");
      const member = { clerkUserId: "user_member", email: "m@example.com" };
      await seedMember(member, "viewer");

      expect(await redeem(tokenOf(url), member)).toEqual({
        outcome: "already-member",
      });

      expect(await roleOf(member)).toBe("viewer");
      expect(await pending()).toHaveLength(1);
      expect((await redeem(tokenOf(url))).outcome).toBe("joined");
    });

    it("reinstates a removed Member on their original row with the new Role", async () => {
      const { url } = await invite("editor");
      const removed = { clerkUserId: "user_removed", email: "r@example.com" };
      await seedMember(removed, "viewer", 1000);

      expect((await redeem(tokenOf(url), removed)).outcome).toBe("joined");

      expect(await roleOf(removed)).toBe("editor");
      const row = await env.DB.prepare(
        "SELECT id, display_name FROM members WHERE clerk_user_id = ?",
      )
        .bind(removed.clerkUserId)
        .first();
      expect(row).toEqual({ id: "id_user_removed", display_name: "Seeded" });
      expect(await pending()).toEqual([]);
    });

    it("tells the winner they are on the Team if they redeem twice", async () => {
      const { url } = await invite();
      await redeem(tokenOf(url));

      expect((await redeem(tokenOf(url))).outcome).toBe("already-member");
    });
  });
});
