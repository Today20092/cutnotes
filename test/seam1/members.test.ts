import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionToken, type Person } from "./support/clerk";
import {
  callServerFn,
  memberServerFunctionIds,
  resultOf,
  serverFunctionIds,
} from "./support/worker";

const { changeMemberRole, getAppShell, listMembers, removeMember } = serverFunctionIds;

const owner: Person = { clerkUserId: "user_owner", email: "owner@example.com" };
const editor: Person = { clerkUserId: "user_editor", email: "editor@example.com" };
const viewer: Person = { clerkUserId: "user_viewer", email: "viewer@example.com" };
const departed: Person = { clerkUserId: "user_departed", email: "gone@example.com" };

const idOf = (person: Person) => `member_${person.email.split("@")[0]}`;

const call = async (id: string, person: Person, data?: unknown) =>
  callServerFn(id, { bearer: await sessionToken(person), data });

async function seedMember(
  person: Person,
  role: string,
  createdAt: number,
  removedAt: number | null = null,
) {
  await env.DB.prepare(
    "INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(idOf(person), person.clerkUserId, person.email, role, createdAt, removedAt)
    .run();
}

const roleOf = async (person: Person) => {
  const response = await call(getAppShell, person);
  if (response.status !== 200) return response.status;
  const { member } = await resultOf<{ member: { role: string } }>(response);
  return member.role;
};

const activeOwners = () =>
  env.DB.prepare(
    "SELECT COUNT(*) AS total FROM members WHERE role = 'owner' AND removed_at IS NULL",
  ).first<number>("total");

const changeRole = (caller: Person, target: Person, role: string) =>
  call(changeMemberRole, caller, { id: idOf(target), role });

async function expectRefused(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ code });
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM invites"),
    env.DB.prepare("DELETE FROM members"),
  ]);
  await seedMember(owner, "owner", 1);
  await seedMember(editor, "editor", 2);
  await seedMember(viewer, "viewer", 3);
  await seedMember(departed, "editor", 4, 1000);
});

describe("the Members list", () => {
  it("shows an Owner every active Member with their Role, oldest first", async () => {
    const response = await call(listMembers, owner);

    expect(response.status).toBe(200);
    const result = await resultOf<{
      youId: string;
      members: { id: string; displayName: string; role: string }[];
    }>(response);
    expect(result.youId).toBe(idOf(owner));
    expect(
      result.members.map(({ id, displayName, role }) => ({ id, displayName, role })),
    ).toEqual([
      { id: idOf(owner), displayName: "owner@example.com", role: "owner" },
      { id: idOf(editor), displayName: "editor@example.com", role: "editor" },
      { id: idOf(viewer), displayName: "viewer@example.com", role: "viewer" },
    ]);
  });

  it("does not reveal Clerk IDs", async () => {
    const response = await call(listMembers, owner);

    expect(await response.text()).not.toContain("user_owner");
  });
});

describe("changing a Role", () => {
  it("takes effect on the Member's next request", async () => {
    expect((await changeRole(owner, viewer, "editor")).status).toBe(200);

    expect(await roleOf(viewer)).toBe("editor");
  });

  it("lets an Owner make another Owner, who can then demote the first", async () => {
    await changeRole(owner, editor, "owner");

    expect((await changeRole(editor, owner, "viewer")).status).toBe(200);

    expect(await roleOf(owner)).toBe("viewer");
    expect(await roleOf(editor)).toBe("owner");
  });

  it("refuses to demote the last active Owner", async () => {
    await expectRefused(await changeRole(owner, owner, "editor"), 409, "last-owner");

    expect(await roleOf(owner)).toBe("owner");
  });

  it("does not count a removed Owner as another Owner", async () => {
    await env.DB.prepare("UPDATE members SET role = 'owner' WHERE id = ?")
      .bind(idOf(departed))
      .run();

    await expectRefused(await changeRole(owner, owner, "viewer"), 409, "last-owner");

    expect(await roleOf(owner)).toBe("owner");
  });

  it("allows setting the last Owner's Role to Owner, which changes nothing", async () => {
    expect((await changeRole(owner, owner, "owner")).status).toBe(200);

    expect(await activeOwners()).toBe(1);
  });

  it("keeps one Owner when two Owners demote each other at once", async () => {
    await changeRole(owner, editor, "owner");

    const responses = await Promise.all([
      changeRole(owner, editor, "viewer"),
      changeRole(editor, owner, "viewer"),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(await activeOwners()).toBe(1);
  });

  it("refuses a removed Member as the target and leaves their Role alone", async () => {
    await expectRefused(await changeRole(owner, departed, "owner"), 404, "not-found");

    const row = await env.DB.prepare("SELECT role FROM members WHERE id = ?")
      .bind(idOf(departed))
      .first<string>("role");
    expect(row).toBe("editor");
  });

  it("refuses an unknown Member", async () => {
    await expectRefused(
      await call(changeMemberRole, owner, { id: "nobody", role: "editor" }),
      404,
      "not-found",
    );
  });

  it.each([
    { id: "member_viewer", role: "admin" },
    { id: "member_viewer", role: 7 },
    { id: "member_viewer" },
    { id: 7, role: "editor" },
    { role: "editor" },
    {},
  ])("refuses the forged input %j", async (data) => {
    expect((await call(changeMemberRole, owner, data)).status).toBe(400);

    expect(await roleOf(viewer)).toBe("viewer");
  });

  it("refuses a forged promotion by a Viewer before reading its input", async () => {
    await expectRefused(
      await call(changeMemberRole, viewer, { id: idOf(viewer), role: "owner" }),
      403,
      "insufficient-role",
    );

    expect(await roleOf(viewer)).toBe("viewer");
  });
});

describe("removing a Member", () => {
  const remove = (caller: Person, target: Person) =>
    call(removeMember, caller, { id: idOf(target) });

  const removedAtOf = (person: Person) =>
    env.DB.prepare("SELECT removed_at FROM members WHERE id = ?")
      .bind(idOf(person))
      .first<number | null>("removed_at");

  it("sets removed_at, keeps the row and takes them off the list", async () => {
    const before = Date.now();

    expect((await remove(owner, viewer)).status).toBe(200);

    expect(await removedAtOf(viewer)).toBeGreaterThanOrEqual(before);
    const listed = await resultOf<{ members: { id: string }[] }>(
      await call(listMembers, owner),
    );
    expect(listed.members.map((member) => member.id)).not.toContain(idOf(viewer));
  });

  it.each(Object.entries(memberServerFunctionIds))(
    "refuses the removed Member at %s from their next request",
    async (_name, id) => {
      await remove(owner, editor);

      await expectRefused(await call(id, editor), 403, "not-a-member");
    },
  );

  it("lets an Owner remove themselves while another Owner remains", async () => {
    await changeRole(owner, editor, "owner");

    expect((await remove(owner, owner)).status).toBe(200);

    expect(await roleOf(owner)).toBe(403);
    expect(await roleOf(editor)).toBe("owner");
  });

  it("refuses to remove the last active Owner", async () => {
    await expectRefused(await remove(owner, owner), 409, "last-owner");

    expect(await removedAtOf(owner)).toBeNull();
  });

  it("keeps one Owner when two Owners remove each other at once", async () => {
    await changeRole(owner, editor, "owner");

    const responses = await Promise.all([remove(owner, editor), remove(editor, owner)]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(await activeOwners()).toBe(1);
  });

  it("refuses a Member who is already removed and keeps the original time", async () => {
    await expectRefused(await remove(owner, departed), 404, "not-found");

    expect(await removedAtOf(departed)).toBe(1000);
  });

  it.each([{ id: 7 }, {}])("refuses the forged input %j", async (data) => {
    expect((await call(removeMember, owner, data)).status).toBe(400);
  });

  it.each([
    ["Editor", editor],
    ["Viewer", viewer],
  ])("refuses a forged removal by a %s", async (_label, caller) => {
    await expectRefused(await remove(caller, owner), 403, "insufficient-role");

    expect(await removedAtOf(owner)).toBeNull();
  });

  it("refuses a forged removal by a removed Member", async () => {
    await expectRefused(await remove(departed, viewer), 403, "not-a-member");

    expect(await removedAtOf(viewer)).toBeNull();
  });
});
