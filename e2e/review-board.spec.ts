import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { announcements, signInWithReview } from "./support/review-page";

test("the status board moves a Video between columns by keyboard and by drag", async ({ page }) => {
  const { id } = await signInWithReview(page);
  await page.goto(`/projects/${id}`);
  await page.getByRole("button", { name: /^Status board/ }).click();
  const board = page.getByRole("region", { name: /^Status board/ });
  const column = (name: string) => board.getByRole("listbox", { name: new RegExp(`^${name}`) });
  const card = board.getByRole("option", { name: "Playback cut" });
  await expect(column("Review").getByRole("option")).toHaveCount(1);

  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(column("Rework").getByRole("option", { name: "Playback cut" })).toBeVisible();
  await expect.poll(() => announcements(page)).toMatch(/Rework/);
  // The tile's own Status control follows the board.
  await expect(page.getByLabel("Status of Playback cut")).toHaveValue("rework");

  expect(
    (
      await new AxeBuilder({ page })
        .include("section:has(#board-heading)")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  const moving = column("Rework").getByRole("option", { name: "Playback cut" });
  await moving.scrollIntoViewIfNeeded();
  const from = (await moving.boundingBox())!;
  const to = (await column("Done").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 20; step++) {
    await page.mouse.move(
      from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * step) / 20,
      from.y + from.height / 2 + ((to.y + to.height / 2 - from.y - from.height / 2) * step) / 20,
    );
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await expect(column("Done").getByRole("option", { name: "Playback cut" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /^Status board/ }).click();
  await expect(column("Done").getByRole("option", { name: "Playback cut" })).toBeVisible();
});
