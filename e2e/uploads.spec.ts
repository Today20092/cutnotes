import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { fakeSignature } from "../test/seam1/support/fake-mux";
import { assignProjectMember, seedMember } from "./support/database";
import { signInAs } from "./support/session";

const owner = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

const callTo = (name: string) => (url: URL) =>
  url.pathname.includes("/_serverFn/") &&
  Buffer.from(url.pathname.split("/").pop() as string, "base64url")
    .toString()
    .includes(name);

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT, OPTIONS",
  "access-control-allow-headers": "*",
};
const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const file = { name: "main-cut.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2048) };

/** Mux's upload host and image host, which Seam 2 never reaches for real. */
async function routeMux(page: Page, chunk: () => Promise<number> = async () => 200) {
  const revisions: string[] = [];
  await page.route("https://uploads.mux.test/**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    revisions.push(new URL(route.request().url()).pathname.slice(1));
    await route.fulfill({ status: await chunk(), headers: cors });
  });
  await page.route("https://image.mux.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/gif", body: pixel }),
  );
  return revisions;
}

function held() {
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { gate, release };
}

async function deliver(page: Page, event: unknown) {
  const body = JSON.stringify(event);
  const response = await page.request.post("/api/mux/webhook", {
    headers: { "mux-signature": fakeSignature(body), "content-type": "application/json" },
    data: body,
  });
  expect(response.status()).toBe(200);
}

const assetEvent = (type: string, passthrough: string, data = {}) => ({
  type: `video.asset.${type}`,
  data: { id: `asset_${passthrough}`, passthrough, ...data },
});

async function openNewProject(page: Page, label: string, testInfo: TestInfo) {
  const name = `${label} ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return name;
}

async function startUpload(page: Page, title: string) {
  await page.getByRole("button", { name: "Upload" }).click();
  await page.getByLabel("Video file").setInputFiles(file);
  await page.getByLabel("Video title").fill(title);
  await page.getByRole("button", { name: "Start upload" }).click();
}

test.beforeEach(async ({ page }) => {
  await signInAs(page, owner);
});

test("an Editor sees delete only for Videos they created", async ({ page }, testInfo) => {
  await routeMux(page);
  const projectName = await openNewProject(page, "Delete roles", testInfo);
  await startUpload(page, "Owner cut");
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();
  const editor = {
    clerkUserId: `user_delete_editor_${testInfo.project.name}`,
    email: "editor@example.com",
  };
  seedMember(editor.clerkUserId, "editor");
  assignProjectMember(editor.clerkUserId, new URL(page.url()).pathname.split("/").pop()!, "editor");
  await signInAs(page, editor);
  await page.reload();
  await expect(page.getByText("Owner cut", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More actions for Owner cut" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: `Delete ${projectName}`, exact: true }),
  ).toHaveCount(0);
  await startUpload(page, "Editor cut");
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();
  await page.getByRole("button", { name: "More actions for Editor cut" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete Editor cut permanently" }).click();
  await expect(page.getByRole("button", { name: "More actions for Editor cut" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Editor cut", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Owner cut", { exact: true })).toBeVisible();
});

test("an upload is followed from progress through processing to a signed poster", async ({
  page,
}, testInfo) => {
  const chunk = held();
  const revisions = await routeMux(page, async () => {
    await chunk.gate;
    return 200;
  });
  await openNewProject(page, "Follow", testInfo);

  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/1080p H\.264 MP4/)).toBeVisible();
  await page.getByLabel("Video file").setInputFiles(file);
  await expect(page.getByLabel("Video title")).toHaveValue("main-cut");
  await page.getByLabel("Video title").fill("Main cut");
  await page.getByRole("button", { name: "Start upload" }).click();

  const uploads = page.getByRole("region", { name: "Uploads" });
  await uploads.locator("summary").click();
  await expect(uploads.getByRole("progressbar", { name: "Uploading Main cut" })).toBeVisible();
  await expect(page.getByText("Uploading…")).toBeVisible();

  chunk.release();
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();
  const revisionId = revisions[0] as string;

  await deliver(page, assetEvent("created", revisionId));
  await expect(page.getByText(/Processing/).first()).toBeVisible({ timeout: 15_000 });

  await deliver(
    page,
    assetEvent("ready", revisionId, {
      duration: 30,
      aspect_ratio: "16:9",
      playback_ids: [{ id: `pb_${revisionId}`, policy: "signed" }],
      tracks: [{ type: "video", max_frame_rate: 25 }],
    }),
  );
  await expect(page.locator(`img[src*="token=fake.t.pb_${revisionId}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Revision 1")).toBeVisible();
});

test("a file over 20 GB is refused before anything is sent", async ({ page }, testInfo) => {
  const revisions = await routeMux(page);
  await openNewProject(page, "Too big", testInfo);
  await page.getByRole("button", { name: "Upload" }).click();

  await page.getByLabel("Video file").evaluate((input) => {
    const big = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 21 * 1024 ** 3 });
    Object.defineProperty(input, "files", { value: [big] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.getByText(/over the 20 GB limit/)).toBeVisible();
  await page.getByLabel("Video title").fill("Huge");
  await page.getByRole("button", { name: "Start upload" }).click();
  await expect(page.getByRole("region", { name: "Uploads" })).toHaveCount(0);
  expect(revisions).toEqual([]);
});

test("a file over 12 hours is refused before anything is sent", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      get: () => 12 * 3600 + 1,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      set(this: HTMLMediaElement) {
        setTimeout(() => this.dispatchEvent(new Event("loadedmetadata")));
      },
    });
  });
  const revisions = await routeMux(page);
  await openNewProject(page, "Too long", testInfo);
  await page.getByRole("button", { name: "Upload" }).click();

  await page.getByLabel("Video file").setInputFiles(file);

  await expect(page.getByText(/over the 12-hour limit/)).toBeVisible();
  expect(revisions).toEqual([]);
});

test("cancelling stops the upload and removes the Video", async ({ page }, testInfo) => {
  const chunk = held();
  await routeMux(page, async () => {
    await chunk.gate;
    return 200;
  });
  await openNewProject(page, "Cancel", testInfo);

  await startUpload(page, "Doomed cut");
  await page.getByRole("region", { name: "Uploads" }).locator("summary").click();
  await page.getByRole("button", { name: "Cancel upload of Doomed cut" }).click();

  await expect(page.getByRole("region", { name: "Uploads" })).toHaveCount(0);
  chunk.release();
  await page.reload();
  await expect(page.getByText(/No Videos yet/)).toBeVisible();
});

test("cancelling while creation is deferred cancels the returned Revision", async ({
  page,
}, testInfo) => {
  const revisions = await routeMux(page);
  await openNewProject(page, "Deferred cancel", testInfo);
  const response = held();
  const created = held();
  await page.route(callTo("startUpload"), async (route) => {
    const result = await route.fetch();
    created.release();
    await response.gate;
    await route.fulfill({ response: result });
  });
  await startUpload(page, "Deferred cut");
  await page.getByRole("region", { name: "Uploads" }).locator("summary").click();
  await created.gate;
  await page.getByRole("button", { name: "Cancel upload of Deferred cut" }).click();
  await expect(page.getByRole("region", { name: "Uploads" })).toBeVisible();
  response.release();
  await expect(page.getByRole("region", { name: "Uploads" })).toHaveCount(0);
  expect(revisions).toEqual([]);
  await page.reload();
  await expect(page.getByText(/No Videos yet/)).toBeVisible();
});

test("a failed cancellation stays visible and can be retried", async ({ page }, testInfo) => {
  const response = held();
  const created = held();
  await routeMux(page);
  await openNewProject(page, "Cancel failure", testInfo);
  await page.route(callTo("startUpload"), async (route) => {
    const result = await route.fetch();
    created.release();
    await response.gate;
    await route.fulfill({ response: result });
  });
  const cancelCall = callTo("cancelUpload");
  await page.route(cancelCall, (route) => route.abort());
  await startUpload(page, "Cancel retry");
  await page.getByRole("region", { name: "Uploads" }).locator("summary").click();
  await created.gate;
  await page.getByRole("button", { name: "Cancel upload of Cancel retry" }).click();
  response.release();
  await expect(page.getByText(/Could not cancel/).first()).toBeVisible();
  await page.unroute(cancelCall);
  await page.getByRole("button", { name: "Cancel upload of Cancel retry" }).click();
  await expect(page.getByRole("region", { name: "Uploads" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/No Videos yet/)).toBeVisible();
});

test("an upload pauses while offline and continues on return", async ({
  page,
  context,
}, testInfo) => {
  const chunk = held();
  const revisions = await routeMux(page, async () => {
    await chunk.gate;
    return 200;
  });
  await openNewProject(page, "Offline", testInfo);
  await startUpload(page, "Offline cut");
  await page.getByRole("region", { name: "Uploads" }).locator("summary").click();
  const uploads = page.getByRole("region", { name: "Uploads" });
  await expect.poll(() => revisions.length).toBeGreaterThan(0);

  await context.setOffline(true);
  await expect(uploads.getByText(/Paused/)).toBeVisible();

  await context.setOffline(false);
  await expect(uploads.getByText(/Paused/)).toHaveCount(0);
  chunk.release();
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible({ timeout: 15_000 });
});

test("leaving the page warns while an upload runs", async ({ page }, testInfo) => {
  const chunk = held();
  await routeMux(page, async () => {
    await chunk.gate;
    return 200;
  });
  await openNewProject(page, "Leave", testInfo);
  await startUpload(page, "Leaving cut");
  await page.getByRole("region", { name: "Uploads" }).locator("summary").click();
  await expect(page.getByRole("progressbar")).toBeVisible();

  const dialog = page.waitForEvent("dialog");
  void page.close({ runBeforeUnload: true });

  const shown = await dialog;
  expect(shown.type()).toBe("beforeunload");
  await shown.dismiss();
  chunk.release();
});

test("a failed send offers a retry that works", async ({ page }, testInfo) => {
  let status = 400;
  await routeMux(page, async () => status);
  await openNewProject(page, "Retry send", testInfo);

  await startUpload(page, "Shaky cut");
  const uploads = page.getByRole("region", { name: "Uploads" });
  await expect(uploads.getByText(/could not be sent/)).toBeVisible({ timeout: 15_000 });

  status = 200;
  await uploads.getByRole("button", { name: "Retry upload of Shaky cut" }).click();

  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible({ timeout: 15_000 });
});

test("failed processing is explained and can be sent again", async ({ page }, testInfo) => {
  const revisions = await routeMux(page);
  await openNewProject(page, "Failed", testInfo);
  await startUpload(page, "Broken cut");
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();

  await deliver(
    page,
    assetEvent("errored", revisions[0] as string, {
      errors: { type: "invalid_input" },
    }),
  );
  await expect(page.getByText(/Processing failed/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Retry Broken cut with a new upload" }).click();
  await page.getByLabel("Video file").setInputFiles(file);
  await page.getByRole("button", { name: "Start upload" }).click();

  await expect(page.getByText("Revision 2")).toBeVisible({ timeout: 15_000 });
});

test("a Status change and a rename appear before the server answers", async ({
  page,
}, testInfo) => {
  await routeMux(page);
  await openNewProject(page, "Manage", testInfo);
  await startUpload(page, "Rough cut");
  const status = page.getByLabel("Status of Rough cut");
  await expect(status).toHaveValue("review");

  const gate = held();
  await page.route(callTo("setVideoStatus"), async (route) => {
    await gate.gate;
    await route.continue();
  });
  await status.selectOption("rework");
  await expect(status).toHaveValue("rework");
  gate.release();

  await page.getByRole("button", { name: "More actions for Rough cut" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Video title").fill("Fine cut");
  await page.getByRole("button", { name: "Save title" }).click();
  await expect(page.getByLabel("Status of Fine cut")).toHaveValue("rework");

  await page.reload();
  await expect(page.getByLabel("Status of Fine cut")).toHaveValue("rework");
});

test("a failed Status change rolls back and says so", async ({ page }, testInfo) => {
  await routeMux(page);
  await openNewProject(page, "Rollback", testInfo);
  await startUpload(page, "Steady cut");
  const status = page.getByLabel("Status of Steady cut");
  await expect(status).toHaveValue("review");
  await page.route(callTo("setVideoStatus"), (route) => route.abort());

  await status.selectOption("done");

  await expect(page.getByRole("alert")).toContainText("Could not change");
  await expect(status).toHaveValue("review");
});

test("a failed Status write preserves a concurrent optimistic rename", async ({
  page,
}, testInfo) => {
  await routeMux(page);
  await openNewProject(page, "Concurrent edits", testInfo);
  await startUpload(page, "Original cut");
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();
  const statusGate = held();
  const renameGate = held();
  let renameStarted = false;
  await page.route(callTo("setVideoStatus"), async (route) => {
    await statusGate.gate;
    await route.abort();
  });
  await page.route(callTo("renameVideo"), async (route) => {
    renameStarted = true;
    await renameGate.gate;
    await route.continue();
  });
  await page.getByLabel("Status of Original cut").selectOption("done");
  await page.getByRole("button", { name: "More actions for Original cut" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Video title").fill("Kept cut");
  await page.getByRole("button", { name: "Save title" }).click();
  await expect(page.getByLabel("Status of Kept cut")).toHaveValue("done");
  expect(renameStarted).toBe(false);
  statusGate.release();
  await expect(page.getByLabel("Status of Kept cut")).toHaveValue("review");
  renameGate.release();
  await expect(
    page.getByRole("status").filter({ hasText: "Video renamed to Kept cut" }),
  ).toBeAttached();
  await page.reload();
  await expect(page.getByLabel("Status of Kept cut")).toHaveValue("review");
});

test("two failed queued Status edits restore the saved Status", async ({ page }, testInfo) => {
  await routeMux(page);
  await openNewProject(page, "Queued rollback", testInfo);
  await startUpload(page, "Queued cut");
  await expect(
    page.getByRole("region", { name: "Notifications" }).getByText(/ready for review/),
  ).toBeVisible();
  const first = held();
  const second = held();
  const refetch = held();
  let requests = 0;
  await page.route(callTo("setVideoStatus"), async (route) => {
    const gate = ++requests === 1 ? first : second;
    await gate.gate;
    await route.abort();
  });
  await page.route(callTo("getProject"), async (route) => {
    await refetch.gate;
    await route.continue();
  });
  const status = page.getByLabel("Status of Queued cut");
  await status.selectOption("done");
  await expect.poll(() => requests).toBe(1);
  await status.selectOption("rework");
  await expect(status).toHaveValue("rework");
  first.release();
  await expect.poll(() => requests).toBe(2);
  await expect(status).toHaveValue("rework");
  second.release();
  await expect(status).toHaveValue("review");
  refetch.release();
  await page.reload();
  await expect(status).toHaveValue("review");
});

test("a Viewer sees the grid but no upload or management controls", async ({ page }, testInfo) => {
  await routeMux(page);
  await openNewProject(page, "Viewer", testInfo);
  await startUpload(page, "Watch only");
  await expect(page.getByLabel("Status of Watch only")).toBeVisible();

  const viewer = {
    clerkUserId: `user_upload_viewer_${testInfo.project.name}`,
    email: "viewer@example.com",
  };
  seedMember(viewer.clerkUserId, "viewer");
  assignProjectMember(viewer.clerkUserId, new URL(page.url()).pathname.split("/").pop()!);
  await signInAs(page, viewer);
  await page.reload();

  await expect(page.getByText("Watch only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(page.getByLabel(/^Status of/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename Watch/ })).toHaveCount(0);
});
