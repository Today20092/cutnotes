import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seedMember } from "./support/database";
import { signInAs } from "./support/session";

const owner = { clerkUserId: "user_first_owner", email: "first.owner@example.com" };
const wcag22AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  // Entrance animations would make colours unstable mid-scan.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity)
        .map((motion) => motion.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(wcag22AA).analyze();
  expect(violations).toEqual([]);
}

test("an Owner shares a Folder with an Uploader who sees only that Folder", async ({
  page,
  browser,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const uploader = { clerkUserId: `uploader_${suffix}`, email: `uploader.${suffix}@example.com` };
  const outsider = { clerkUserId: `outsider_${suffix}`, email: `outsider.${suffix}@example.com` };
  seedMember(uploader.clerkUserId, "viewer", uploader.email);
  seedMember(outsider.clerkUserId, "editor", outsider.email);
  const folderName = `Client folder ${suffix}`;
  const otherName = `Other folder ${suffix}`;
  const projectName = `Folder project ${suffix}`;

  await signInAs(page, owner);
  await page.goto("/");
  for (const name of [folderName, otherName]) {
    await page.getByRole("button", { name: "New folder", exact: true }).click();
    await page.getByLabel("Folder name").fill(name);
    await page.getByRole("button", { name: "Create Folder", exact: true }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Folders", exact: true })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: folderName, exact: true }).click();
  await expect(page.getByRole("heading", { name: folderName, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New project", exact: true }).first().click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Create Project", exact: true }).click();
  await expect(page.getByRole("link", { name: projectName, exact: true })).toBeVisible();
  const folderUrl = page.url();
  await expectAccessible(page);

  await page.getByRole("button", { name: `Share ${folderName}`, exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "People with access" })).toBeVisible();
  await sheet.getByLabel("Team member", { exact: true }).selectOption(uploader.clerkUserId);
  await sheet.getByLabel("Role", { exact: true }).selectOption("uploader");
  await expect(
    sheet.getByText(/Can add videos and new versions of their own videos/).first(),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Add to folder", exact: true }).click();
  await expect(sheet.getByLabel(`Folder role for ${uploader.email}`)).toHaveValue("uploader");

  await sheet.getByRole("radio", { name: /^Uploader/ }).check();
  await sheet.getByLabel("Optional note").fill(`For a freelancer ${suffix}`);
  await sheet.getByRole("button", { name: "Create Invite", exact: true }).click();
  expect(await sheet.getByLabel("Link to send").inputValue()).toContain("/invite/");
  await expectAccessible(page);
  await page.keyboard.press("Escape");

  const uploaderContext = await browser.newContext();
  const uploaderPage = await uploaderContext.newPage();
  await signInAs(uploaderPage, uploader);
  await uploaderPage.goto("/");
  await expect(uploaderPage.getByRole("link", { name: folderName, exact: true })).toBeVisible();
  await expect(uploaderPage.getByRole("link", { name: otherName, exact: true })).toHaveCount(0);
  await expect(uploaderPage.getByRole("button", { name: "New folder" })).toHaveCount(0);
  await uploaderPage.goto(folderUrl);
  await expect(uploaderPage.getByRole("link", { name: projectName, exact: true })).toBeVisible();
  await expect(uploaderPage.getByRole("button", { name: /^Share/ })).toHaveCount(0);
  await uploaderPage.getByRole("link", { name: projectName, exact: true }).click();
  await expect(uploaderPage.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();
  await expect(uploaderPage.getByRole("link", { name: folderName, exact: true })).toBeVisible();
  await uploaderPage.getByRole("button", { name: "Upload", exact: true }).first().click();
  await expect(uploaderPage.getByRole("heading", { name: "Upload a Video" })).toBeVisible();
  await uploaderPage.keyboard.press("Escape");
  await expect(uploaderPage.getByText(/^Status/)).toHaveCount(0);
  await expect(uploaderPage.getByRole("button", { name: /^Share/ })).toHaveCount(0);

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await signInAs(outsiderPage, outsider);
  await outsiderPage.goto("/");
  await expect(outsiderPage.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(outsiderPage.getByRole("link", { name: folderName, exact: true })).toHaveCount(0);
  await outsiderPage.goto(folderUrl);
  await expect(outsiderPage.getByRole("heading", { name: "Folder not found" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: otherName, exact: true }).click();
  await page.getByRole("button", { name: `Delete ${otherName}`, exact: true }).click();
  await expect(page.getByText(/they become unfiled|become unfiled/)).toBeVisible();
  await page
    .getByRole("button", { name: `Delete ${otherName}`, exact: true })
    .last()
    .click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: otherName, exact: true })).toHaveCount(0);
  await uploaderContext.close();
  await outsiderContext.close();
});
