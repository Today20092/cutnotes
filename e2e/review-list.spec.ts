import { expect, test } from "@playwright/test";
import { seedComment } from "./support/database";
import { commentList, openVideo, signInWithReview } from "./support/review-page";

test("the Comment list counts To do and offers Undo after Resolve", async ({ page }) => {
  const { id, clerkUserId } = await signInWithReview(page);
  seedComment(id, clerkUserId, "Lift the shadows", 1, 1040);
  await openVideo(page, id);
  const list = commentList(page);
  await expect(list.getByText("0:01:01", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Other reviewer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "To do (1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Review queue/ })).toHaveCount(0);
  await list.getByRole("checkbox", { name: /^Resolve Comment/ }).press("Space");
  await expect(page.getByRole("button", { name: "To do (0)" })).toBeFocused();
  await expect(page.getByText("No Comments to do.")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "To do (1)" })).toBeVisible();
  await page.reload();
  await expect(list.getByText("Lift the shadows")).toBeVisible();
});

test("switching the Comment filter keeps the reader's place", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Only the stacked phone layout scrolls the page.");
  const { id, clerkUserId } = await signInWithReview(page);
  // Equal lists, so the page keeps its height and only a scroll reset could move it.
  for (let n = 0; n < 8; n++)
    seedComment(id, clerkUserId, `Note ${n}`, n + 1, 1000 + n, n % 2 ? Date.now() : null);
  await openVideo(page, id);
  const resolved = page.getByRole("button", { name: "Resolved", exact: true });
  await resolved.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  await resolved.click();
  await expect(page).toHaveURL(/filter=resolved/);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("swiping right resolves a Comment on touch", async ({ page, context, isMobile }) => {
  const { id, clerkUserId } = await signInWithReview(page);
  seedComment(id, clerkUserId, "Swipe to resolve");
  await openVideo(page, id);
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const row = commentList(page).getByRole("button", { name: /Swipe to resolve/ });
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const x = box.x + 20;
  const y = box.y + box.height / 2;
  if (isMobile) {
    const client = await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 15; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (box.width * 0.6 * step) / 15, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(row).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + box.width * 0.6, y, { steps: 15 });
    await page.mouse.up();
    await expect(row).toBeVisible();
  }
});

test("the player shows frames and resumes forward after pausing reverse", async ({ page }) => {
  const { id } = await signInWithReview(page);
  await openVideo(page, id, "?t=5");
  const player = page.getByRole("region", { name: "Video player" });
  const video = page.locator("video");
  const play = player.getByRole("button", { name: "Play", exact: true });
  const pause = player.getByRole("button", { name: "Pause", exact: true });
  await expect(player.getByText("0:05:00 / 0:08:00")).toBeVisible();
  await player.getByRole("button", { name: "Next frame" }).click();
  await expect(player.getByText("0:05:01 / 0:08:00")).toBeVisible();
  await expect(page.locator("label[for=comment-body]")).toContainText("0:05:01");
  for (const resume of [
    () => page.keyboard.press("Space"),
    () => play.click(),
    () => video.click(),
  ]) {
    await video.focus();
    await page.keyboard.press("j");
    await expect(pause).toBeVisible();
    await expect(player.getByText("−1x", { exact: true })).toBeVisible();
    await page.keyboard.press("k");
    await expect(play).toBeVisible();
    await resume();
    await expect(pause).toBeVisible();
    await expect(player.getByText("−1x", { exact: true })).toHaveCount(0);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => [v.paused, v.playbackRate]))
      .toEqual([false, 1]);
  }
});

test("Approve and Request changes both offer Undo", async ({ page }) => {
  const { id } = await signInWithReview(page);
  await openVideo(page, id);
  const decision = page.getByRole("region", { name: "Review decision" });
  for (const [action, status] of [
    ["Approve", "Done"],
    ["Request changes", "Rework"],
  ] as const) {
    await decision.getByRole("button", { name: action }).click();
    await expect(decision.getByText(status, { exact: true })).toBeVisible();
    // The previous decision's toast can still be closing, so use the newest toast's Undo.
    await page.locator("[data-front]").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(decision.getByText("Review", { exact: true })).toBeVisible();
  }
});
