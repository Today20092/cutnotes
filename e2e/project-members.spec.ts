import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seedMember, seedReview } from "./support/database";
import { signInAs } from "./support/session";

const owner = { clerkUserId: "user_first_owner", email: "first.owner@example.com" };

test("an Owner assigns a project, sends a scoped invitation, and removes access", async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const assigned = { clerkUserId: `assigned_${suffix}`, email: `assigned.${suffix}@example.com` };
  const stranger = { clerkUserId: `stranger_${suffix}`, email: `stranger.${suffix}@example.com` };
  const invitee = { clerkUserId: `invitee_${suffix}`, email: `invitee.${suffix}@example.com` };
  seedMember(assigned.clerkUserId, "editor", assigned.email);
  seedMember(stranger.clerkUserId, "editor", stranger.email);
  await signInAs(page, owner);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const name = `Private project ${suffix}`;
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  const projectUrl = page.url();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
  await page.getByLabel("Team member", { exact: true }).selectOption(assigned.clerkUserId);
  await page.getByLabel("Project role", { exact: true }).selectOption("viewer");
  await page.getByRole("button", { name: "Add to project", exact: true }).click();
  await expect(page.getByLabel(`Project role for ${assigned.email}`)).toHaveValue("viewer");

  const assignedContext = await browser.newContext();
  const assignedPage = await assignedContext.newPage();
  await signInAs(assignedPage, assigned);
  await assignedPage.goto(projectUrl);
  await expect(assignedPage.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(assignedPage.getByRole("button", { name: "Upload", exact: true })).toHaveCount(0);
  await expect(assignedPage.getByRole("heading", { name: "People", exact: true })).toHaveCount(0);

  await page.getByRole("radio", { name: /^Editor/ }).check();
  await page.getByLabel("Optional note").fill(`For Taylor ${suffix}`);
  await page.getByRole("button", { name: "Create Invite", exact: true }).click();
  const url = await page.getByLabel("Link to send").inputValue();
  const invitedContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await signInAs(invitedPage, invitee);
  await invitedPage.goto(url);
  await expect(invitedPage.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(invitedPage.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  await invitedPage.goto("/");
  await expect(invitedPage.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(invitedPage.getByRole("button", { name: "New project", exact: true })).toHaveCount(
    0,
  );
  await expect(invitedPage.getByRole("button", { name: "Upload", exact: true })).toBeVisible();

  await page.reload();
  const history = page.getByRole("listitem").filter({ hasText: `For Taylor ${suffix}` });
  await expect(history).toContainText(`Accepted by ${invitee.email}`);
  await expect(history).toContainText("Created by");
  await expect(history.getByRole("button", { name: /^Revoke/ })).toHaveCount(0);
  await expect(history.getByRole("link", { name: "Manage membership" })).toBeVisible();
  await page.getByLabel(`Project role for ${assigned.email}`).selectOption("editor");
  await expect(page.getByLabel(`Project role for ${assigned.email}`)).toHaveValue("editor");
  await assignedPage.reload();
  await expect(assignedPage.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("project-people.png"), fullPage: true });
  const removal = page.getByRole("button", {
    name: `Remove ${assigned.email} from this project`,
    exact: true,
  });
  await removal.click();
  await page.getByRole("button", { name: / now$/ }).click();
  await assignedPage.reload();
  await expect(
    assignedPage.getByRole("heading", { name: "Project not found", exact: true }),
  ).toBeVisible();
  const strangerContext = await browser.newContext();
  const strangerPage = await strangerContext.newPage();
  await signInAs(strangerPage, stranger);
  await strangerPage.goto(projectUrl);
  await expect(
    strangerPage.getByRole("heading", { name: "Project not found", exact: true }),
  ).toBeVisible();
  await expect(strangerPage.getByText(name, { exact: true })).toHaveCount(0);
  await assignedContext.close();
  await invitedContext.close();
  await strangerContext.close();
});

test("a team Editor creates private projects and can reopen a direct video URL", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const person = {
    clerkUserId: `creator_${testInfo.project.name}_${Date.now()}`,
    email: "creator@example.com",
  };
  seedMember(person.clerkUserId, "editor", person.email);
  const videoId = seedReview(person.clerkUserId);
  await signInAs(page, person);
  await page.goto(`/videos/${videoId}`);
  await expect(page.getByRole("heading", { name: "Playback cut", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy video link", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy video link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await expect(page.getByRole("button", { name: /share/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Playback cut", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const name = `Created by editor ${testInfo.project.name} ${Date.now()}`;
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy project link", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy project link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People", exact: true })).toHaveCount(0);
});
