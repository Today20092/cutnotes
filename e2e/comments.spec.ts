import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  removeSeededComment,
  seedComment,
  seedMember,
  seedReview,
  seedReadyRevision,
  shareTokenFor,
} from "./support/database";
import { signInAs } from "./support/session";
import { sampleStream } from "./support/sample-stream";

const callTo = (name: string) => (url: URL) =>
  url.pathname.includes("/_serverFn/") &&
  Buffer.from(url.pathname.split("/").pop()!, "base64url").toString().includes(name);
const createCall = callTo("createComment");
const editCall = callTo("editComment");

test("Drawing tools pause, undo, clear and replay over the picture after resizing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(10_000);
  await openReview(page, "viewer");
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page.getByRole("button", { name: "Yellow", exact: true }).click();
  const overlay = page.getByLabel("Drawing picture", { exact: true });
  let rect = (await overlay.boundingBox())!; // clicking controls can scroll the phone layout
  await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(overlay.locator("rect")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo Drawing", exact: true }).click();
  await expect(overlay.locator("rect")).toHaveCount(0);
  rect = (await overlay.boundingBox())!; // clicking controls can scroll the phone layout
  await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.75);
  await page.mouse.up();
  await page.getByRole("button", { name: "Clear Drawing", exact: true }).click();
  await expect(overlay.locator("rect")).toHaveCount(0);
  rect = (await overlay.boundingBox())!; // clicking controls can scroll the phone layout
  await page.mouse.move(rect.x + rect.width * 0.25, rect.y + rect.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.75, rect.y + rect.height * 0.75);
  await page.mouse.up();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Finish drawing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Draw", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await page.reload();
  await page
    .getByRole("listitem")
    .getByRole("button", { name: /drawing/i })
    .click();
  const before = await page
    .getByLabel("Drawing picture", { exact: true })
    .locator("rect")
    .getAttribute("x");
  await page.setViewportSize({ width: 800, height: 900 });
  await expect(page.getByLabel("Drawing picture", { exact: true }).locator("rect")).toHaveAttribute(
    "x",
    before!,
  );
  const bounds = (await page.getByLabel("Drawing picture", { exact: true }).boundingBox())!;
  const shape = (await page
    .getByLabel("Drawing picture", { exact: true })
    .locator("rect")
    .boundingBox())!;
  expect((shape.x - bounds.x) / bounds.width).toBeCloseTo(0.25, 1);
  expect(shape.width / bounds.width).toBeCloseTo(0.5, 1);
  expect((shape.y - bounds.y) / bounds.height).toBeCloseTo(0.25, 1);
  expect(shape.height / bounds.height).toBeCloseTo(0.5, 1);
});

test("touch pen simplifies, cancelled gestures do not save, and failed sends keep the Drawing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openReview(page);
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const draw = page.getByRole("button", { name: "Draw", exact: true });
  await draw.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Pen", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("button", { name: "Pen", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Red", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const overlay = page.getByLabel("Drawing picture", { exact: true });
  await overlay.scrollIntoViewIfNeeded();
  const rect = (await overlay.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", fraction = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints:
        type === "touchEnd" || type === "touchCancel"
          ? []
          : [{ x: rect.x + rect.width * fraction, y: rect.y + rect.height * fraction, id: 1 }],
    });
  await touch("touchStart", 0.1);
  await touch("touchMove", 0.2);
  await touch("touchCancel");
  await expect(overlay.locator("polyline")).toHaveCount(0);
  await touch("touchStart", 0.1);
  for (let i = 11; i <= 80; i++) await touch("touchMove", i / 100);
  await touch("touchEnd");
  await cdp.detach();
  const points = (await overlay.locator("polyline").getAttribute("points"))!
    .split(/[ ,]/)
    .map(Number);
  expect(points).toHaveLength(4);
  for (const [i, expected] of [100, 100, 800, 800].entries())
    expect(points[i]).toBeCloseTo(expected, 2);
  await page.getByRole("button", { name: "Finish drawing", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(draw).toBeFocused();
  await page.route(createCall, (route) => route.abort());
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  await expect(overlay.locator("polyline")).toHaveCount(1);
  await page.unroute(createCall);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await page.reload();
  await page
    .getByRole("listitem")
    .getByRole("button", { name: /drawing/i })
    .click();
  await expect(overlay.locator("polyline")).toHaveAttribute(
    "points",
    points.join(",").replace(/,([^,]+),([^,]+)$/, " $1,$2"),
  );
});

test("a Drawing over the shape cap is refused with a message and replay passes axe", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openReview(page);
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const overlay = page.getByLabel("Drawing picture", { exact: true });
  const rect = (await overlay.boundingBox())!;
  for (let i = 0; i < 51; i++) {
    await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect(page.getByRole("alert")).toContainText("Drawing is too large");
  await expect(overlay.locator("polyline")).toHaveCount(50);
  const axe = () =>
    new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect((await axe()).violations).toEqual([]);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await page.reload();
  await page
    .getByRole("listitem")
    .getByRole("button", { name: /drawing/i })
    .click();
  await expect(overlay.locator("polyline")).toHaveCount(50);
  expect((await axe()).violations).toEqual([]);
});

async function openReview(page: Page, role: "viewer" | "editor" = "editor") {
  const clerkUserId = `user_comments_${crypto.randomUUID()}`;
  seedMember(clerkUserId, role, "Reviewer");
  const id = seedReview(clerkUserId);
  await signInAs(page, { clerkUserId, email: "reviewer@example.com" });
  await page.route("https://image.mux.com/**", (route) =>
    route.fulfill({
      contentType: "image/gif",
      body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("https://stream.mux.com/**", (route) =>
    route.fulfill({
      body: route.request().url().includes(".ts")
        ? sampleStream
        : "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\nhttps://stream.mux.com/sample.ts\n#EXT-X-ENDLIST\n",
      contentType: route.request().url().includes(".ts")
        ? "video/mp2t"
        : "application/vnd.apple.mpegurl",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto(`/videos/${id}`);
  await expect(page.getByRole("heading", { name: "Playback cut" })).toBeVisible();
  return { id, clerkUserId };
}

test("ready Revision history is one tap away and keeps feedback on its own cut", async ({
  page,
}) => {
  const { id, clerkUserId } = await openReview(page);
  await expect(
    page.getByRole("button", { name: "Upload new Revision", exact: true }),
  ).toBeVisible();
  seedComment(id, clerkUserId, "Older cut feedback");
  const newer = seedReadyRevision(id, clerkUserId, 2);
  seedComment(newer, clerkUserId, "Current cut feedback");
  await page.reload();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Current cut feedback" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revision 1", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Older cut feedback" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Current cut feedback" })).toHaveCount(
    0,
  );
  await page.getByLabel(/^Add a Comment/).fill("Still on the older cut");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Still on the older cut" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Still on the older cut" })
      .getByRole("button", { name: /^Edit Comment/ }),
  ).toBeEnabled();
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity)
        .map((motion) => motion.finished.catch(() => {})),
    ),
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Revision 2", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Current cut feedback" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Still on the older cut" }),
  ).toHaveCount(0);
});

test("opening a Video clears the Member's unread marker", async ({ page }) => {
  const { id } = await openReview(page);
  const other = `other_${crypto.randomUUID()}`;
  seedMember(other, "editor");
  seedComment(id, other, "New feedback from someone else", Date.now());
  await page.goto(`/projects/${id}`);
  const tile = page.getByRole("listitem").filter({ hasText: "Playback cut" });
  await expect(tile.getByText("Unread activity", { exact: true })).toBeVisible();
  await tile.getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Playback cut" })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "New feedback from someone else" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "breadcrumb" })
    .getByRole("link", { name: "Playback project" })
    .click();
  await expect(page.getByRole("listitem").filter({ hasText: "Playback cut" })).toBeVisible();
  await expect(page.getByText("Unread activity", { exact: true })).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("a Comment appears before the answer; a failed send keeps its text for retry", async ({
  page,
}) => {
  await openReview(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(createCall, async (route) => {
    await held;
    await route.abort();
  });
  await page.getByLabel(/^Add a Comment/).fill("Keep this feedback");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(0);
  await expect(page.getByLabel(/^Add a Comment/)).toHaveValue("Keep this feedback");
  await page.unroute(createCall);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Keep this feedback" })).toHaveCount(1);
});

test("Comments seek, edit, Resolve and delete with sensible focus and accessible states", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openReview(page);
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 3;
  });
  await expect(page.getByText("Add a Comment at 0:03", { exact: true })).toBeVisible();
  await page.getByLabel(/^Add a Comment/).fill("Change this frame");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Change this frame" });
  await expect(row.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 0;
  });
  await row.getByRole("button", { name: "0:03 Change this frame", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "0:03 Change this frame", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeCloseTo(3, 1);
  await expect(
    page.getByRole("button", { name: "Comment at 0:03: Change this frame", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: /^Edit Comment/ }).click();
  await page.getByLabel("Edit Comment text").fill("Edited feedback");
  await page.route(editCall, (route) => route.abort());
  await page.getByRole("button", { name: "Save Comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not edit");
  await expect(page.getByLabel("Edit Comment text")).toHaveValue("Edited feedback");
  await page.unroute(editCall);
  await page.getByRole("button", { name: "Save Comment", exact: true }).click();
  const edited = page.getByRole("listitem").filter({ hasText: "Edited feedback" });
  await edited.getByRole("checkbox", { name: /^Resolve Comment/ }).click();
  await expect(page.getByRole("button", { name: "To do", exact: true })).toBeFocused();
  await expect(edited).toHaveCount(0);
  await page.getByRole("button", { name: "Resolved", exact: true }).click();
  await expect(edited).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expect(edited.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity)
          .map((motion) => motion.finished.catch(() => {})),
      ),
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await edited.getByRole("checkbox", { name: /^Unresolve Comment/ }).click();
  await page.getByRole("button", { name: "To do", exact: true }).click();
  await edited.getByRole("button", { name: /^Delete Comment/ }).click();
  await expect(edited).toHaveCount(0);
  await expect(page.getByRole("button", { name: "To do", exact: true })).toBeFocused();
});

test("Undo and a failed delayed delete restore only the selected Comment", async ({ page }) => {
  const { id, clerkUserId } = await openReview(page);
  seedComment(id, clerkUserId, "Keep this Comment");
  seedComment(id, clerkUserId, "Other Comment");
  await page.reload();
  // Playback Comments has a separate provider; Undo needs the lazy page-wide provider.
  await expect(
    page.locator('[data-slot="toast-viewport"][data-position="top-center"]'),
  ).toBeAttached();
  const row = page.getByRole("listitem").filter({ hasText: "Keep this Comment" });
  const other = page.getByRole("listitem").filter({ hasText: "Other Comment" });
  await row.getByRole("button", { name: /^Delete Comment/ }).click();
  await expect(row).toHaveCount(0);
  await page.getByText("Undo", { exact: true }).click({ timeout: 3000 });
  await expect(row).toBeVisible();
  await expect(other).toBeVisible();

  await page.route(callTo("deleteComment"), (route) => route.abort());
  await row.getByRole("button", { name: /^Delete Comment/ }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Could not delete Comment", {
    timeout: 10_000,
  });
  await expect(row).toBeVisible();
  await expect(other).toBeVisible();
});

test("Viewers can write and manage their own Comments without Resolve controls", async ({
  page,
}) => {
  await openReview(page, "viewer");
  await expect(page.getByRole("button", { name: "Upload new Revision", exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel(/^Add a Comment/).fill("Viewer feedback");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Delete Comment/ })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("polling and returning to the screen replace the full Comment list including deletions", async ({
  page,
}) => {
  await page.clock.install();
  const { id, clerkUserId } = await openReview(page);
  const commentId = seedComment(id, clerkUserId, "Arrived from another screen");
  await page.clock.fastForward(31_000);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Arrived from another screen" }),
  ).toBeVisible();
  removeSeededComment(commentId);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await expect(
    page.getByRole("listitem").filter({ hasText: "Arrived from another screen" }),
  ).toHaveCount(0);
});

test("retrying after a lost answer reuses the ID and never duplicates the optimistic Comment", async ({
  page,
}) => {
  await openReview(page);
  const payloads: (string | null)[] = [];
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(createCall, async (route) => {
    payloads.push(route.request().postData());
    if (payloads.length === 1) {
      await route.fetch();
      await route.abort();
    } else {
      await held;
      await route.continue();
    }
  });
  await page.getByLabel(/^Add a Comment/).fill("Lost answer");
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not send");
  const row = page.getByRole("listitem").filter({ hasText: "Lost answer" });
  await expect(row).toHaveCount(1);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toBe(payloads[0]);
  try {
    await expect(row).toHaveCount(1);
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Send Comment", exact: true })).toBeEnabled();
  await page.reload();
  await expect(row).toHaveCount(1);
});

test("rapid writes are serialized per Video and only the last pending write refreshes", async ({
  page,
}) => {
  await openReview(page);
  let sent = 0;
  let reads = 0;
  let releaseFirst = () => {};
  let releaseSecond = () => {};
  const first = new Promise<void>((resolve) => (releaseFirst = resolve));
  const second = new Promise<void>((resolve) => (releaseSecond = resolve));
  await page.route(callTo("getReview"), async (route) => {
    reads++;
    await route.continue();
  });
  await page.route(createCall, async (route) => {
    sent++;
    await (sent === 1 ? first : second);
    await route.continue();
  });
  await page.getByLabel(/^Add a Comment/).fill("Rapid submission");
  await page.getByLabel(/^Add a Comment/).evaluate((field: HTMLTextAreaElement) => {
    field.form!.requestSubmit();
    field.form!.requestSubmit();
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

test("a Guest goes from the welcome screen to a saved Comment, then sees a plain retry message when limited", async ({
  page,
  browser,
}, testInfo) => {
  const person = {
    clerkUserId: `user_guest_${testInfo.project.name}_${Date.now()}`,
    email: "guest-flow@example.com",
  };
  seedMember(person.clerkUserId, "editor");
  const videoId = seedReview(person.clerkUserId);
  await signInAs(page, person);
  await page.goto(`/videos/${videoId}`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Who is this link for?").fill("Client");
  await page.getByRole("button", { name: "Create Share Link" }).click();
  await expect(page.getByRole("button", { name: "Revoke link for Client" })).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/share/${shareTokenFor(videoId)}`);
  await guest.getByLabel("Your name").fill("  Dana  ");
  await guest.getByRole("button", { name: "Continue" }).click();
  const text = guest.getByLabel(/^Add a Comment/);
  const send = async (body: string) => {
    await text.fill(body);
    await guest.getByRole("button", { name: "Send Comment" }).click();
  };
  await send("Too dark here");
  await expect(text).toHaveValue("");
  await guest.reload();
  await expect(guest.getByText("Dana · Guest")).toBeVisible();
  await expect(guest.getByText(/Too dark here/)).toBeVisible();
  await expect(guest.getByRole("button", { name: /^(Edit|Delete)/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Dana · Guest")).toBeVisible();

  // Thirty real sends could straddle the limiter's one-minute window. Seam 1 covers the real limit; this covers the screen.
  await guest.route(callTo("createGuestComment"), (route) =>
    route.fulfill({
      status: 429,
      headers: { "x-tss-raw": "thrown" },
      json: { code: "rate-limited" },
    }),
  );
  await send("One too many");
  await expect(
    guest.getByText("Too many Comments right now. Your text is kept; wait a minute and try again."),
  ).toBeVisible();
  await expect(text).toHaveValue("One too many");
  await expect(guest.getByRole("listitem").filter({ hasText: "One too many" })).toHaveCount(0);
  await expect(guest.getByRole("listitem").filter({ hasText: "Too dark here" })).toBeVisible();
});
