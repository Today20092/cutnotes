import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { seedComment } from "./support/database";
import { announcements, openVideo, signInWithReview } from "./support/review-page";

test("the review queue resolves and deletes notes with arrow keys and announces each", async ({
  page,
}) => {
  const { id, clerkUserId } = await signInWithReview(page);
  seedComment(id, clerkUserId, "Lift the shadows", 1, 1000);
  seedComment(id, clerkUserId, "Trim the intro", 2, 2000);
  seedComment(id, clerkUserId, "Fix the title card", 3, 3000);
  await openVideo(page, id);
  const queue = page.getByRole("list", { name: "Open notes" });
  const row = (text: string) => queue.getByRole("button", { name: new RegExp(text) });
  await expect(queue.getByRole("listitem")).toHaveCount(3);

  await row("Lift the shadows").focus();
  await page.keyboard.press("ArrowDown");
  await expect(row("Trim the intro")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(row("Trim the intro")).toHaveCount(0);
  await expect.poll(() => announcements(page)).toContain("Resolved: 0:02 Trim the intro");

  await row("Fix the title card").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(row("Fix the title card")).toHaveCount(0);
  await expect.poll(() => announcements(page)).toContain("Deleted: 0:03 Fix the title card");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row("Fix the title card")).toBeVisible();

  expect(
    (
      await new AxeBuilder({ page })
        .include("section:has(#queue-heading)")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.reload();
  await expect(queue.getByRole("listitem")).toHaveCount(2);
  await expect(row("Trim the intro")).toHaveCount(0);
});

test("swiping a note right resolves it and swiping left past half deletes it", async ({ page }) => {
  const { id, clerkUserId } = await signInWithReview(page);
  seedComment(id, clerkUserId, "Swipe to resolve", 1, 1000);
  seedComment(id, clerkUserId, "Swipe to delete", 2, 2000);
  await openVideo(page, id);
  // The player changes the layout while it loads, which a swipe would read as a vertical scroll.
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const queue = page.getByRole("list", { name: "Open notes" });
  const swipe = async (text: string, direction: 1 | -1) => {
    const note = queue.getByRole("button", { name: new RegExp(text) });
    await note.scrollIntoViewIfNeeded();
    const box = (await note.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = direction === 1 ? box.x + 20 : box.x + box.width - 20;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    // Moves are read once a frame, like a finger's; one jump would release before the last frame.
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(startX + (direction * box.width * 0.6 * step) / 20, y);
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
  };

  await swipe("Swipe to resolve", 1);
  await expect(queue.getByRole("button", { name: /Swipe to resolve/ })).toHaveCount(0);
  await expect.poll(() => announcements(page)).toContain("Resolved: 0:01 Swipe to resolve");

  await swipe("Swipe to delete", -1);
  await expect(queue.getByRole("button", { name: /Swipe to delete/ })).toHaveCount(0);
  await expect(page.getByText("No open notes. Everything is resolved.")).toBeVisible();
});
