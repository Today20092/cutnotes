import { expect, test, type Browser, type Page } from "@playwright/test";
import { signInAs, type Person } from "./support/session";

// The first Owner already exists: app-shell.spec.ts runs first against the shared database.
const owner: Person = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

async function createInviteLink(page: Page, role: "Viewer" | "Editor") {
  await signInAs(page, owner);
  await page.goto("/invites");
  await page.getByRole("radio", { name: new RegExp(`^${role}`) }).check();
  await page.getByRole("button", { name: "Create Invite" }).click();
  const link = page.getByLabel("Link to send");
  await expect(link).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite link" })).toBeFocused();
  return link.inputValue();
}

async function openAs(browser: Browser, person: Person, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, person);
  await page.goto(url);
  return page;
}

test("an Owner invites someone, who joins by opening the link once", async ({
  page,
  browser,
}, testInfo) => {
  const url = await createInviteLink(page, "Viewer");
  const invitee = {
    clerkUserId: `user_invitee_${testInfo.project.name}`,
    email: `invitee.${testInfo.project.name}@example.com`,
  };

  const joined = await openAs(browser, invitee, url);
  await expect(joined.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(joined.getByRole("link", { name: "Invites" })).toHaveCount(0);

  await joined.goto("/invites");
  await expect(joined.getByText("Only an Owner can manage Invites.")).toBeVisible();

  const late = await openAs(
    browser,
    { clerkUserId: `user_late_${testInfo.project.name}`, email: "late@example.com" },
    url,
  );
  await expect(
    late.getByRole("heading", { name: "This Invite has already been used" }),
  ).toBeFocused();
  await expect(late.getByText(/to send you a new one/)).toBeVisible();
});

test("an Owner revokes a pending Invite, and its link stops working", async ({
  page,
  browser,
}, testInfo) => {
  const url = await createInviteLink(page, "Editor");

  // A fresh list, so the newest Invite is first.
  await page.reload();
  const revoke = page.getByRole("button", { name: /^Revoke Editor Invite/ }).first();
  await expect(revoke).toBeVisible();
  const before = await page.getByRole("button", { name: /^Revoke/ }).count();
  await revoke.click();
  await expect(page.getByRole("button", { name: /^Revoke/ })).toHaveCount(before - 1);
  await expect(page.getByRole("heading", { name: "Pending Invites" })).toBeFocused();

  const visitor = await openAs(
    browser,
    {
      clerkUserId: `user_revoked_${testInfo.project.name}`,
      email: "revoked@example.com",
    },
    url,
  );
  await expect(visitor.getByRole("heading", { name: "This Invite was cancelled" })).toBeVisible();
});

test("an existing Member is told so and the Invite stays pending", async ({ page, browser }) => {
  const url = await createInviteLink(page, "Editor");

  const member = await openAs(browser, owner, url);

  await expect(member.getByRole("heading", { name: "You are already on this Team" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Revoke Editor Invite/ }).first()).toBeVisible();
});

test("a signed-out visitor is asked to sign in to accept", async ({ page }) => {
  await page.goto("/invite/some-token");

  await expect(page.getByRole("heading", { name: "You have been invited" })).toBeVisible();
});
