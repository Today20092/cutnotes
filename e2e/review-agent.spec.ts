import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { seedComment } from "./support/database";
import { openQueue, openVideo, signInWithReview } from "./support/review-page";

/**
 * One review task done two ways, as an agent's tool calls:
 * add a note at 0:05, resolve "Lift the shadows", then send the Project back to Editing.
 * "Reads" are what the agent receives: an ARIA snapshot for browser tools, JSON for the bridge.
 */
type Run = { calls: number; reads: number; actions: number; bytes: number; ms: number };

function meter() {
  const run: Run = { calls: 0, reads: 0, actions: 0, bytes: 0, ms: 0 };
  const started = performance.now();
  return {
    run,
    read(payload: unknown) {
      run.calls++;
      run.reads++;
      run.bytes += (typeof payload === "string" ? payload : JSON.stringify(payload)).length;
      return payload;
    },
    async act<T>(work: Promise<T>, payload?: unknown) {
      run.calls++;
      run.actions++;
      const result = await work;
      if (payload !== undefined) run.bytes += JSON.stringify(payload ?? result).length;
      return result;
    },
    done: () => ((run.ms = Math.round(performance.now() - started)), run),
  };
}

const bridge = (page: Page) => ({
  snapshot: () => page.evaluate(() => window.__cutnotesAgent!.snapshot()),
  act: (steps: { ref: string; action: string; args?: unknown[] }[]) =>
    page.evaluate((steps) => window.__cutnotesAgent!.act({ steps }), steps),
});

async function setUp(page: Page, query = "?agent") {
  const { id, clerkUserId } = await signInWithReview(page);
  seedComment(id, clerkUserId, "Lift the shadows", 1, 1000);
  seedComment(id, clerkUserId, "Trim the intro", 2, 2000);
  await openVideo(page, id, query);
  await expect
    .poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  if (query) await expect.poll(() => page.evaluate(() => !!window.__cutnotesAgent)).toBe(true);
  return id;
}

async function expectTaskDone(page: Page, id: string) {
  await openVideo(page, id);
  const queue = await openQueue(page);
  await expect(queue.getByRole("button", { name: /^0:05 Agent note/ })).toBeVisible();
  await expect(queue.getByRole("button", { name: /Lift the shadows/ })).toHaveCount(0);
  await expect(queue.getByRole("button", { name: /Trim the intro/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("article", { name: "Playback project, Editing" })).toBeVisible();
}

const results: Record<string, Run> = {};
let sample: unknown;

test.describe.configure({ mode: "serial" });

test("browser-style tools: read the ARIA tree, then click and type", async ({ page }) => {
  test.setTimeout(90_000);
  // No bridge and no Agent panel: plain browser automation.
  const id = await setUp(page, "");
  const m = meter();
  const look = async () => m.read(await page.locator("body").ariaSnapshot());

  await look();
  const scrub = page.getByRole("slider", { name: "Playback position" });
  // A browser agent finds the track's position from a screenshot; the slider role is only the thumb.
  const box = (await page.locator(".player-scrub").boundingBox())!;
  // The composer uses the playback time, so the agent scrubs to 5 of 8 seconds by position.
  await m.act(page.mouse.click(box.x + (box.width * 5.2) / 8, box.y + box.height / 2));
  await look();
  const label = page.getByText(/^Add a Comment at /);
  for (
    let tries = 0;
    tries < 10 && (await label.textContent()) !== "Add a Comment at 0:05";
    tries++
  ) {
    const later = ((await label.textContent()) ?? "") < "Add a Comment at 0:05";
    await m.act(scrub.press(later ? "ArrowRight" : "ArrowLeft"));
    await look();
  }
  await m.act(page.getByLabel(/^Add a Comment at/).fill("Agent note"));
  await m.act(page.getByRole("button", { name: "Send Comment" }).click());
  await look();
  await m.act(
    page.getByRole("checkbox", { name: "Resolve Comment by Other reviewer at 0:01" }).click(),
  );
  await look();
  await m.act(page.getByRole("button", { name: "Request changes" }).click());
  await look();
  results.browser = m.done();

  await expectTaskDone(page, id);
});

test("ui-sdk agent bridge: snapshot, then act on components by name", async ({ page }) => {
  test.setTimeout(90_000);
  const id = await setUp(page);
  const agent = bridge(page);
  const m = meter();

  const video = m.read(await agent.snapshot()) as { component: string; actions: string[] }[];
  sample = video;
  // The queue is behind a closed Collapsible: the agent opens it, then uses what it reveals.
  expect(video.some((entry) => entry.component === "collapsible")).toBe(true);
  const done = await m.act(
    agent.act([
      { ref: "Review queue", action: "open" },
      { ref: "Open notes", action: "addNote", args: ["0:05", "Agent note"] },
      { ref: "Open notes", action: "resolve", args: ["Lift the shadows"] },
    ]),
    null,
  );
  expect(done.ok).toBe(true);
  // The bridge has no navigation; an agent follows the link like any browser agent.
  await m.act(page.getByRole("link", { name: "Projects" }).first().click());
  await expect(page.getByRole("region", { name: "Board" })).toBeVisible();
  const home = m.read(await agent.snapshot()) as { component: string; actions?: string[] }[];
  expect(home.some((entry) => entry.actions?.includes("setStage"))).toBe(true);
  const moved = await m.act(
    agent.act([{ ref: "review-board", action: "setStage", args: ["Playback project", "Editing"] }]),
    null,
  );
  expect(moved.ok).toBe(true);
  results.bridge = m.done();

  await expectTaskDone(page, id);
});

test("ui-sdk agent bridge: the decision bar offers approve and requestChanges", async ({
  page,
}) => {
  await setUp(page);
  const agent = bridge(page);
  const snapshot = (await agent.snapshot()) as { actions?: string[] }[];
  expect(
    snapshot.some(
      (entry) => entry.actions?.includes("approve") && entry.actions.includes("requestChanges"),
    ),
  ).toBe(true);
  const done = await agent.act([{ ref: "review-decision", action: "requestChanges" }]);
  expect(done.ok).toBe(true);
  await expect(page.getByRole("region", { name: "Review decision" })).toContainText("Rework");
});

test("the dev Agent panel shows the snapshot and runs scripted steps", async ({ page }) => {
  await setUp(page);
  await page.getByRole("button", { name: "Read the page" }).click();
  await expect(page.getByLabel("Agent output")).toContainText('"component": "collapsible"');
  await page.getByRole("button", { name: "Resolve the first open note" }).click();
  await expect(page.getByLabel("Agent log")).toContainText("Resolve the first open note: ok");
  await expect(
    page
      .getByRole("list", { name: "Open notes" })
      .getByRole("button", { name: /Lift the shadows/ }),
  ).toHaveCount(0);
  await page.goto("/?agent");
  await page.getByRole("button", { name: "Move the first Project to In review" }).click();
  await expect(page.getByLabel("Agent log")).toContainText("In review: ok");
  await expect(page.getByRole("article", { name: "Playback project, In review" })).toBeVisible();
});

test.afterAll(() => {
  if (!results.browser || !results.bridge) return;
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/agent-benchmark.json", JSON.stringify({ results, sample }, null, 2));
  console.table(results);
});
