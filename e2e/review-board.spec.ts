import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { assignProjectMember, seedMember } from "./support/database";
import { announcements, openVideo, signInWithReview } from "./support/review-page";
import { signInAs } from "./support/session";

const board = (page: Page) => page.getByRole("region", { name: "Board" });
const column = (page: Page, name: string) =>
  board(page).getByRole("region", { name: new RegExp(`^${name}`) });
const card = (page: Page, stage: string) =>
  board(page).getByRole("article", { name: `Playback project, ${stage}` });

async function expectNoViolations(page: Page) {
  expect(
    (
      await new AxeBuilder({ page })
        .include("section:has(#board-heading)")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("the home board moves a Project between Stages by keyboard, with Undo", async ({ page }) => {
  await signInWithReview(page);
  await page.goto("/");
  await expect(column(page, "New").getByRole("article")).toHaveCount(1);
  await expectNoViolations(page);

  await card(page, "New").focus();
  await page.keyboard.press("Space");
  await expect(card(page, "New")).toHaveAttribute("data-grabbed", "");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(
    column(page, "Editing").getByRole("article", { name: /^Playback project/ }),
  ).toBeVisible();
  await expect.poll(() => announcements(page)).toMatch(/Editing/);
  await expect(board(page).getByRole("status")).toHaveText("Playback project moved to Editing");

  await board(page).getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card(page, "New")).toBeVisible();
  await expect(board(page).getByRole("status")).toHaveText("Playback project moved back to New");
  await page.reload();
  await expect(card(page, "New")).toBeVisible();
});

test("a card's menu and, on desktop, a drag move it; the Stage filter is in the URL", async ({
  page,
}, testInfo) => {
  await signInWithReview(page);
  await page.goto("/");
  await board(page).getByRole("button", { name: "More actions for Playback project" }).click();
  await page.getByRole("menuitem", { name: "Move to In review" }).click();
  await expect(card(page, "In review")).toBeVisible();

  if (testInfo.project.name === "desktop") {
    const from = (await card(page, "In review").boundingBox())!;
    const to = (await column(page, "Done").boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 20);
    await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(
        from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * step) / 20,
        from.y + 20 + ((to.y + to.height / 2 - from.y - 20) * step) / 20,
      );
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await expect(card(page, "Done")).toBeVisible();
    await page.reload();
    await expect(card(page, "Done")).toBeVisible();
  }

  const stage = testInfo.project.name === "desktop" ? "Done" : "In review";
  await page.getByLabel("Show Stage").getByRole("button", { name: /^New/ }).click();
  await expect(page).toHaveURL(/\?stage=new$/);
  await expect(card(page, stage)).toHaveCount(0);
  await expect(column(page, "New")).toBeVisible();
  await expect(column(page, stage)).toHaveCount(0);
  await page.goto("/?stage=nonsense");
  await expect(card(page, stage)).toBeVisible();
  await expectNoViolations(page);
});

test("a Reviewer reads the board but cannot move cards", async ({ page }, testInfo) => {
  const { id } = await signInWithReview(page);
  const reviewer = `user_board_reviewer_${testInfo.project.name}_${crypto.randomUUID()}`;
  seedMember(reviewer, "viewer", "Board reviewer");
  assignProjectMember(reviewer, id);
  await signInAs(page, { clerkUserId: reviewer, email: "reviewer@example.com" });
  await page.goto("/");
  await expect(card(page, "New")).toBeVisible();
  await expect(
    board(page).getByRole("button", { name: "More actions for Playback project" }),
  ).toHaveCount(0);
  await card(page, "New").focus();
  await page.keyboard.press("Space");
  await expect(card(page, "New")).not.toHaveAttribute("data-grabbed", "");
});

test("Request changes and Approve on the review page move the Project", async ({ page }) => {
  const { id } = await signInWithReview(page);
  await openVideo(page, id);
  const decision = page.getByRole("region", { name: "Review decision" });
  await decision.getByRole("button", { name: "Request changes" }).click();
  await expect(decision.getByText("Changes requested", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(card(page, "Editing")).toContainText("Changes requested · Rev 1");

  await openVideo(page, id);
  await decision.getByRole("button", { name: "Approve" }).click();
  await expect(decision.getByText("Approved", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(card(page, "Done")).toBeVisible();
});
