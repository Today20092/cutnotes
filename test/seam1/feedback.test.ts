import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";
import { seedMember } from "./support/seed";
import { sessionToken } from "./support/clerk";
import { callServerFn, serverFunctionIds as ids, resultOf } from "./support/worker";

const data = { kind: "broken", message: "Playback stopped", diagnostics: { path: "/" } };
beforeEach(async () => {
  await env.DB.exec("DELETE FROM feedback; DELETE FROM members");
});

it("accepts signed-out reports and removes Share Link and Invite credentials", async () => {
  const share = "a".repeat(32);
  const invite = "b".repeat(43);
  const response = await callServerFn(ids.sendFeedback, {
    data: {
      ...data,
      diagnostics: {
        path: `/share/${share}?key=short-secret`,
        error: `/invite/${invite}`,
        query: ["guest", share],
        cookie: "short-cookie",
        authorization: "Bearer short-auth",
        jwt: "eyJabc.def.ghi",
      },
    },
  });
  expect(response.status).toBe(200);
  const row = await env.DB.prepare("SELECT diagnostics, member_id FROM feedback").first<{
    diagnostics: string;
    member_id: string | null;
  }>();
  expect(row!.member_id).toBeNull();
  expect(row!.diagnostics).not.toContain(share);
  expect(row!.diagnostics).not.toContain(invite);
  for (const secret of ["short-secret", "short-cookie", "short-auth", "eyJabc.def.ghi"])
    expect(row!.diagnostics).not.toContain(secret);
  expect(JSON.parse(row!.diagnostics).sender.role).toBe("Guest");
});

it("validates forged inputs and limits diagnostic size", async () => {
  for (const forged of [
    null,
    {},
    { ...data, message: " " },
    { ...data, kind: "bad" },
    { ...data, diagnostics: [] },
    { ...data, diagnostics: { huge: "x".repeat(20001) } },
  ]) {
    expect((await callServerFn(ids.sendFeedback, { data: forged })).status).toBe(400);
  }
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM feedback").first<{ n: number }>())!.n,
  ).toBe(0);
});

it("rate limits one address while allowing another", async () => {
  for (let i = 0; i < 5; i++)
    expect((await callServerFn(ids.sendFeedback, { address: "192.0.2.30", data })).status).toBe(
      200,
    );
  expect((await callServerFn(ids.sendFeedback, { address: "192.0.2.30", data })).status).toBe(429);
  expect((await callServerFn(ids.sendFeedback, { address: "192.0.2.31", data })).status).toBe(200);
});

it("records Members and lets only Owners read and handle reports", async () => {
  const user = await seedMember("owner");
  const bearer = await sessionToken({ clerkUserId: user });
  expect((await callServerFn(ids.sendFeedback, { bearer, data })).status).toBe(200);
  const response = await callServerFn(ids.listFeedback, { bearer });
  const { reports } = await resultOf<{
    reports: { id: string; handledAt: number | null; diagnostics: string }[];
  }>(response);
  expect(JSON.parse(reports[0]!.diagnostics).sender).toEqual({
    role: "owner",
    memberId: "member_owner",
  });
  const change = { id: reports[0]!.id, handled: true, note: "Resolved" };
  for (const role of ["viewer", "editor"]) {
    const caller = await seedMember(role);
    const token = await sessionToken({ clerkUserId: caller });
    expect((await callServerFn(ids.listFeedback, { bearer: token })).status).toBe(403);
    expect((await callServerFn(ids.markFeedback, { bearer: token, data: change })).status).toBe(
      403,
    );
  }
  expect((await callServerFn(ids.listFeedback)).status).toBe(401);
  expect((await callServerFn(ids.markFeedback, { data: change })).status).toBe(401);
  expect((await callServerFn(ids.markFeedback, { bearer, data: change })).status).toBe(200);
  expect(
    (await env.DB.prepare("SELECT handled_at FROM feedback").first<{ handled_at: number }>())!
      .handled_at,
  ).toBeGreaterThan(0);
  expect(
    (await env.DB.prepare("SELECT handled_note FROM feedback").first<{ handled_note: string }>())!
      .handled_note,
  ).toBe("Resolved");
});
