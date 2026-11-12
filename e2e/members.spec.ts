import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { seedMember } from "./support/database";
import { signInAs, type Person } from "./support/session";

// The first Owner already exists: app-shell.spec.ts runs first against the shared database.
const owner: Person = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

function seededPerson(testInfo: TestInfo, label: string, role: "editor" | "viewer") {
  const name = `${label} ${testInfo.project.name} ${Date.now()}`;
  const person = {
    clerkUserId: `user_${label}_${testInfo.project.name}_${Date.now()}`,
    email: `${label}@example.com`,
  };
  seedMember(person.clerkUserId, role, name);
  return { person, name };
}

const roleOf = (page: Page, name: string) =>
  page.getByRole("combobox", { name: `Role for ${name}` });

test("an Owner changes a Member's Role, and it lasts", async ({ page }, testInfo) => {
  const { name } = seededPerson(testInfo, "promoted", "viewer");
  await signInAs(page, owner);
  await page.goto("/members");

  await roleOf(page, name).click();
  await page.getByRole("option", { name: /Editor/ }).click();

  await expect(page.getByRole("status").first()).toContainText(`${name} is now Editor`);
  await page.reload();
  await expect(roleOf(page, name)).toHaveText("Editor");
});

test("an Owner removes a Member, who loses access on their next request", async ({
  page,
  browser,
}, testInfo) => {
  const { person, name } = seededPerson(testInfo, "departing", "editor");
  await signInAs(page, owner);
  await page.goto("/members");

  await page.getByRole("button", { name: `Remove ${name}` }).click();
  const confirm = page.getByRole("button", { name: "Remove from Team" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await confirm.click();

  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "People on the Team" })).toBeFocused();

  const context = await browser.newContext();
  const removed = await context.newPage();
  await signInAs(removed, person);
  await removed.goto("/");
  await expect(removed.getByRole("heading", { name: /need an Invite/i })).toBeVisible();
  await context.close();
});

test("keeping a Member after pressing Remove returns focus to Remove", async ({
  page,
}, testInfo) => {
  const { name } = seededPerson(testInfo, "kept", "viewer");
  await signInAs(page, owner);
  await page.goto("/members");

  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await page.getByRole("button", { name: "Keep Member" }).click();

  await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeFocused();
});

test("demoting the last Owner is refused, explained and rolled back", async ({ page }) => {
  await signInAs(page, owner);
  await page.goto("/members");

  await roleOf(page, owner.email).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toContainText("at least one Owner");
  await expect(roleOf(page, owner.email)).toHaveText("Owner");
});

test("a Viewer gets no Members link and no controls", async ({ page }, testInfo) => {
  const { person } = seededPerson(testInfo, "onlooker", "viewer");
  await signInAs(page, person);
  await page.goto("/members");

  await expect(page.getByText("Only an Owner can manage Members.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Members" })).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

test("an Owner reaches Members from the navigation", async ({ page }) => {
  await signInAs(page, owner);
  await page.goto("/");

  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).click();
  await page.getByRole("link", { name: "Members" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeFocused();
  await expect(page).toHaveTitle(/Members/);
});
