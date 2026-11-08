import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { removeSeededComment, seedComment, seedMember, seedReview } from "./support/database";
import { signInAs } from "./support/session";
import { sampleStream } from "./support/sample-stream";

const callTo = (name: string) => (url: URL) => url.pathname.includes("/_serverFn/") && Buffer.from(url.pathname.split("/").pop()!, "base64url").toString().includes(name);
const createCall = callTo("createComment");
const editCall = callTo("editComment");

async function openReview(page: Page, role: "viewer" | "editor" = "editor") {
  const clerkUserId = `user_comments_${crypto.randomUUID()}`;
  seedMember(clerkUserId, role, "Reviewer");
  const id = seedReview(clerkUserId);
  await signInAs(page, { clerkUserId, email: "reviewer@example.com" });
  await page.route("https://image.mux.com/**", (route) => route.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"), headers: { "access-control-allow-origin": "*" } }));
  await page.route("https://stream.mux.com/**", (route) => route.fulfill({
    body: route.request().url().includes(".ts") ? sampleStream : "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\nhttps://stream.mux.com/sample.ts\n#EXT-X-ENDLIST\n",
    contentType: route.request().url().includes(".ts") ? "video/mp2t" : "application/vnd.apple.mpegurl", headers: { "access-control-allow-origin": "*" },
  }));
  await page.goto(`/videos/${id}`);
  await expect(page.getByRole("heading", { name: "Playback cut" })).toBeVisible();
  return { id, clerkUserId };
}

test("a Comment appears before the answer; a failed send keeps its text for retry", async ({ page }) => {
  await openReview(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => release = resolve);
  await page.route(createCall, async (route) => { await held; await route.abort(); });
  await page.getByLabel("Comment text", { exact: true }).fill("Keep this feedback");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(0);
  await expect(page.getByLabel("Comment text", { exact: true })).toHaveValue("Keep this feedback");
  await page.unroute(createCall);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(1);
});

test("Comments seek, edit, Resolve and delete with sensible focus and accessible states", async ({ page }) => {
  test.setTimeout(60_000);
  await openReview(page);
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.currentTime = 3; });
  await expect(page.getByText("At 0:03", { exact: true })).toBeVisible();
  await page.getByLabel("Comment text", { exact: true }).fill("Change this frame");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Change this frame" });
  await expect(row.getByRole("button", { name: "Edit Comment", exact: true })).toBeEnabled();
  await page.locator("video").evaluate((video: HTMLVideoElement) => { video.currentTime = 0; });
  await row.getByRole("button", { name: "0:03 · Change this frame", exact: true }).click();
  await expect(row.getByRole("button", { name: "0:03 · Change this frame", exact: true })).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(3, 1);
  await expect(page.getByRole("button", { name: "Comment at 0:03: Change this frame", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit Comment", exact: true }).click();
  await page.getByLabel("Edit Comment text").fill("Edited feedback");
  await page.route(editCall, (route) => route.abort());
  await page.getByRole("button", { name: "Save Comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not edit");
  await expect(page.getByLabel("Edit Comment text")).toHaveValue("Edited feedback");
  await page.unroute(editCall);
  await page.getByRole("button", { name: "Save Comment", exact: true }).click();
  const edited = page.getByRole("listitem").filter({ hasText: "Edited feedback" });
  await edited.getByRole("checkbox", { name: "Resolve Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: "To do", exact: true })).toBeFocused();
  await expect(edited).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(edited).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expect(edited.getByRole("button", { name: "Edit Comment", exact: true })).toBeEnabled();
    await page.evaluate(() => Promise.all(document.getAnimations().filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity).map((motion) => motion.finished.catch(() => {}))));
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await edited.getByRole("checkbox", { name: "Unresolve Comment", exact: true }).click();
  await page.getByRole("button", { name: "To do", exact: true }).click();
  await edited.getByRole("button", { name: "Delete Comment", exact: true }).click();
  await expect(edited).toHaveCount(0);
  await expect(page.getByRole("button", { name: "To do", exact: true })).toBeFocused();
});

test("Viewers can write and manage their own Comments without Resolve controls", async ({ page }) => {
  await openReview(page, "viewer");
  await page.getByLabel("Comment text", { exact: true }).fill("Viewer feedback");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Comment", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Delete Comment", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
});

test("polling and returning to the screen replace the full Comment list including deletions", async ({ page }) => {
  await page.clock.install();
  const { id, clerkUserId } = await openReview(page);
  const commentId = seedComment(id, clerkUserId, "Arrived from another screen");
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("listitem").filter({ hasText: "Arrived from another screen" })).toBeVisible();
  removeSeededComment(commentId);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await expect(page.getByRole("listitem").filter({ hasText: "Arrived from another screen" })).toHaveCount(0);
});

test("retrying after a lost answer reuses the ID and never duplicates the optimistic Comment", async ({ page }) => {
  await openReview(page);
  const payloads: (string | null)[] = [];
  let release = () => {};
  const held = new Promise<void>((resolve) => release = resolve);
  await page.route(createCall, async (route) => {
    payloads.push(route.request().postData());
    if (payloads.length === 1) { await route.fetch(); await route.abort(); }
    else { await held; await route.continue(); }
  });
  await page.getByLabel("Comment text", { exact: true }).fill("Lost answer");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  const row = page.getByRole("listitem").filter({ hasText: "Lost answer" });
  await expect(row).toHaveCount(1);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toBe(payloads[0]);
  try { await expect(row).toHaveCount(1); } finally { release(); }
  await expect(page.getByRole("button", { name: "Send Comment", exact: true })).toBeEnabled();
  await page.reload();
  await expect(row).toHaveCount(1);
});

test("rapid writes are serialized per Video and only the last pending write refreshes", async ({ page }) => {
  await openReview(page);
  let sent = 0;
  let reads = 0;
  let releaseFirst = () => {};
  let releaseSecond = () => {};
  const first = new Promise<void>((resolve) => releaseFirst = resolve);
  const second = new Promise<void>((resolve) => releaseSecond = resolve);
  await page.route(callTo("getReview"), async (route) => { reads++; await route.continue(); });
  await page.route(createCall, async (route) => {
    sent++;
    await (sent === 1 ? first : second);
    await route.continue();
  });
  await page.getByLabel("Comment text", { exact: true }).fill("Rapid submission");
  await page.getByLabel("Comment text", { exact: true }).evaluate((field: HTMLTextAreaElement) => {
    field.form!.requestSubmit(); field.form!.requestSubmit();
  });
  await expect.poll(() => sent).toBe(1);
  expect(reads).toBe(0);
  releaseFirst();
  await expect.poll(() => sent).toBe(2);
  expect(reads).toBe(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Rapid submission" })).toHaveCount(1);
  releaseSecond();
  await expect(page.getByRole("button", { name: "Send Comment", exact: true })).toBeEnabled();
  expect(reads).toBe(1);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Rapid submission" })).toHaveCount(1);
});
