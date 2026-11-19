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
  const strip = page.getByRole("region", { name: "People with access" });
  await expect(strip).toContainText("Only Team Owners have access");

  await strip.getByRole("link", { name: "Manage people" }).click();
  await expect(page).toHaveURL(/\?sheet=people$/);
  const sheet = page.getByRole("dialog", { name: "People" });
  await expect(sheet.getByRole("heading", { name: "People with access" })).toBeVisible();
  await expect(sheet).toContainText("Owner · always has access");
  await expect(sheet.getByLabel("Role", { exact: true })).toHaveValue("uploader");
  await sheet.getByLabel("Team member", { exact: true }).selectOption(assigned.clerkUserId);
  await sheet.getByLabel("Role", { exact: true }).selectOption("viewer");
  await sheet.getByRole("button", { name: "Add to project", exact: true }).click();
  await expect(sheet.getByLabel(`Project role for ${assigned.email}`)).toHaveValue("viewer");

  await sheet.getByRole("radio", { name: /^Editor/ }).check();
  await sheet.getByRole("button", { name: "More options" }).click();
  await sheet.getByLabel("Optional note").fill(`For Taylor ${suffix}`);
  await sheet.getByRole("button", { name: "Create Invite", exact: true }).click();
  const url = await sheet.getByLabel("Link to send").inputValue();
  const pending = sheet.getByRole("listitem").filter({ hasText: `For Taylor ${suffix}` });
  await expect(pending).toContainText("Pending");
  await expect(pending).toContainText("Editor");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("project-people.png"), fullPage: true });

  // A second invitation is revoked from the same list.
  await sheet.getByLabel("Optional note").fill(`Spare ${suffix}`);
  await sheet.getByRole("button", { name: "Create Invite", exact: true }).click();
  await expect(sheet.getByRole("button", { name: /^Revoke/ })).toHaveCount(2);
  const second = sheet.getByRole("listitem").filter({ hasText: `Spare ${suffix}` });
  await second.getByRole("button", { name: /^Revoke/ }).click();
  await page.getByRole("button", { name: / now$/ }).click();
  await expect(sheet.getByRole("button", { name: /^Revoke/ })).toHaveCount(1);

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).not.toHaveURL(/sheet=/);
  await expect(strip).toContainText(assigned.email);
  await expect(strip).toContainText("Reviewer");

  const assignedContext = await browser.newContext();
  const assignedPage = await assignedContext.newPage();
  await signInAs(assignedPage, assigned);
  await assignedPage.goto(projectUrl);
  await expect(assignedPage.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(assignedPage.getByRole("button", { name: "Upload", exact: true })).toHaveCount(0);
  await expect(assignedPage.getByRole("link", { name: "Manage people" })).toHaveCount(0);
  // Assigned people see who else has access, read-only.
  await assignedPage.getByRole("link", { name: "See people" }).click();
  const readOnly = assignedPage.getByRole("dialog", { name: "People" });
  await expect(readOnly).toContainText(assigned.email);
  await expect(readOnly.getByRole("combobox")).toHaveCount(0);
  await expect(readOnly.getByRole("button", { name: /^(Remove|Revoke)/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page: assignedPage }).analyze()).violations).toEqual([]);

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

  // The older `#people` link still opens the sheet; the accepted invitation became an assignment.
  await page.goto("/");
  await page.goto(`${projectUrl}#people`);
  await expect(sheet.getByLabel(`Project role for ${invitee.email}`)).toHaveValue("editor");
  await expect(sheet.getByRole("listitem").filter({ hasText: `For Taylor ${suffix}` })).toHaveCount(
    0,
  );
  await sheet.getByLabel(`Project role for ${assigned.email}`).selectOption("editor");
  await expect(sheet.getByLabel(`Project role for ${assigned.email}`)).toHaveValue("editor");
  await assignedPage.reload();
  await expect(assignedPage.getByRole("button", { name: "Upload", exact: true })).toBeVisible();

  // Access at a glance: the home card and the Team page.
  await page.goto("/");
  await expect(
    page.getByRole("img", { name: new RegExp(`^People with access: .*${assigned.email}, Editor`) }),
  ).toBeVisible();
  await page.goto("/members");
  const projectsOf = page.getByRole("list", { name: `Projects for ${assigned.email}` });
  await expect(projectsOf.getByRole("link", { name: `${name} Editor` })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto(`${projectUrl}?sheet=people`);
  const removal = sheet.getByRole("button", {
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
  await expect(page.getByRole("button", { name: /send to customer/i })).toHaveCount(0);
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
  // The Editor who created it is assigned; only Owners manage people.
  await expect(page.getByRole("region", { name: "People with access" })).toContainText("Editor");
  await expect(page.getByRole("link", { name: "See people" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage people" })).toHaveCount(0);
});
