import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { seedMember, seedReview } from "./support/database";
import { signInAs } from "./support/session";
import { sampleStream } from "./support/sample-stream";

const cors = { "access-control-allow-origin": "*" };
const playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:8
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:8,
https://stream.mux.com/sample.ts
#EXT-X-ENDLIST
`;

async function openReview(page: Page, ready = true) {
  const clerkUserId = `user_playback_${crypto.randomUUID()}`;
  seedMember(clerkUserId, "viewer");
  const id = seedReview(clerkUserId, ready);
  await signInAs(page, { clerkUserId, email: "viewer@example.com" });
  await page.route("https://image.mux.com/**", (route) => route.fulfill({
    contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"), headers: cors,
  }));
  await page.goto(`/videos/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Playback cut" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Playback project" })).toHaveAttribute("href", `/projects/${id}`);
  return id;
}

async function accessible(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.evaluate(() => Promise.all(document.getAnimations().filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity).map((motion) => motion.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
}

test("review unavailable states remain accessible", async ({ page }) => {
  await openReview(page, false);
  await expect(page.getByRole("status").filter({ hasText: "No Revision is ready" })).toBeVisible();
  await accessible(page);
  await page.goto("/videos/missing");
  await expect(page.getByRole("heading", { name: "Video not found" })).toBeVisible();
  await accessible(page);
});

test("playback failure and retry are accessible", async ({ page }) => {
  let broken = true;
  await page.route("https://stream.mux.com/**", (route) => route.fulfill({
    status: broken ? 403 : 200, body: playlist, contentType: "application/vnd.apple.mpegurl", headers: cors,
  }));
  await openReview(page);
  await expect(page.getByRole("alert")).toContainText("Playback could not continue");
  await accessible(page);
  broken = false;
  await page.route("https://stream.mux.com/sample.ts", (route) => route.fulfill({ body: sampleStream, contentType: "video/mp2t", headers: cors }));
  await page.getByRole("button", { name: "Retry playback" }).click();
  await expect(page.locator("video")).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await accessible(page);
});

for (const playing of [false, true]) {
test(`a 403 renews credentials and keeps the ${playing ? "playing" : "paused"} position`, async ({ page }) => {
  let expired = false;
  let renewals = 0;
  let allowExpiry = () => {};
  const positioned = new Promise<void>((resolve) => { allowExpiry = resolve; });
  await page.route("https://stream.mux.com/**", (route) => route.fulfill({
    body: playlist.replace("#EXT-X-ENDLIST", "#EXT-X-DISCONTINUITY\n#EXTINF:8,\nhttps://stream.mux.com/second.ts\n#EXT-X-ENDLIST"),
    contentType: "application/vnd.apple.mpegurl", headers: cors,
  }));
  await page.route("https://stream.mux.com/second.ts", async (route) => {
    if (!expired) {
      expired = true;
      await positioned;
      await route.fulfill({ status: 403, headers: cors });
    } else await route.fulfill({ body: sampleStream, contentType: "video/mp2t", headers: cors });
  });
  await page.route("https://stream.mux.com/sample.ts", (route) => route.fulfill({ body: sampleStream, contentType: "video/mp2t", headers: cors }));
  page.on("request", (request) => {
    if (!request.url().includes("/_serverFn/")) return;
    const data = request.postData() ?? "";
    if (data.includes("revisionId")) renewals++;
  });
  await openReview(page);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.currentTime = 3; });
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.seeking)).toBe(false);
  if (playing) {
    await page.locator("video").evaluate((video: HTMLVideoElement) => video.play());
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(3.1);
  }
  const position = await page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);
  allowExpiry();
  await expect.poll(() => renewals).toBe(1);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(position - 0.1);
  expect(await page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeLessThan(position + 2);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.paused)).toBe(!playing);
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 3; });
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(3.04, 1);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await accessible(page);
  // At 320 CSS px and short landscape heights the Comments stay in document flow.
  await page.setViewportSize({ width: 320, height: 256 });
  await page.getByRole("heading", { name: "Comments", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Comments", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}
