import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { fakeSignature } from "../test/seam1/support/fake-mux";
import { seedMember } from "./support/database";
import { signInAs, type Person } from "./support/session";

// Sorted after app-shell.spec.ts, so the first Owner already exists.
const owner: Person = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

const wcag22AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Scans the page as it stands, in both colour schemes, once its entrance animations end. */
async function expectAccessible(page: Page, state: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((motion) => motion.effect?.getComputedTiming().iterations !== Infinity)
          .map((motion) => motion.finished.catch(() => undefined)),
      ),
    );
    const { violations } = await new AxeBuilder({ page }).withTags(wcag22AA).analyze();
    expect
      .soft(
        violations.flatMap((violation) =>
          violation.nodes.map((node) => `${violation.id}: ${node.target.join(" ")} — ${node.failureSummary}`),
        ),
        `${state} (${colorScheme})`,
      )
      .toEqual([]);
  }
}

const callTo = (name: string) => (url: URL) =>
  url.pathname.includes("/_serverFn/") &&
  Buffer.from(url.pathname.split("/").pop() as string, "base64url")
    .toString()
    .includes(name);

const uniqueName = (label: string, testInfo: TestInfo) =>
  `${label} ${testInfo.project.name} ${Date.now()}`;

function seededViewer(label: string, testInfo: TestInfo): Person {
  const clerkUserId = `user_axe_${label}_${testInfo.project.name}_${Date.now()}`;
  seedMember(clerkUserId, "viewer", uniqueName(label, testInfo));
  return { clerkUserId, email: `${label}@example.com` };
}

async function openNewProject(page: Page, testInfo: TestInfo) {
  const name = uniqueName("Axe", testInfo);
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return name;
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT, OPTIONS",
  "access-control-allow-headers": "*",
};
const pixel = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Answers Mux's hosts. Each uploaded chunk gets the status from `chunk`. */
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

async function deliver(page: Page, type: string, passthrough: string, data = {}) {
  const body = JSON.stringify({
    type: `video.asset.${type}`,
    data: { id: `asset_${passthrough}`, passthrough, ...data },
  });
  const response = await page.request.post("/api/mux/webhook", {
    headers: { "mux-signature": fakeSignature(body), "content-type": "application/json" },
    data: body,
  });
  expect(response.status()).toBe(200);
}

async function startUpload(page: Page, title: string) {
  await page.getByRole("button", { name: "Upload" }).click();
  await page
    .getByLabel("Video file")
    .setInputFiles({ name: "cut.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2048) });
  await page.getByLabel("Video title").fill(title);
  await page.getByRole("button", { name: "Start upload" }).click();
}

async function openAs(browser: Browser, person: Person, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInAs(page, person);
  await page.goto(url);
  return page;
}

async function createInviteLink(page: Page) {
  await page.goto("/invites");
  await page.getByRole("radio", { name: /^Viewer/ }).check();
  await page.getByRole("button", { name: "Create Invite" }).click();
  const link = page.getByLabel("Link to send");
  await expect(link).toBeVisible();
  return link.inputValue();
}

test("the signed-out and non-Member screens", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expectAccessible(page, "sign in");

  await page.goto("/invite/some-token");
  await expect(page.getByRole("heading", { name: "You have been invited" })).toBeVisible();
  await expectAccessible(page, "invite, signed out");

  const stranger = await openAs(
    browser,
    { clerkUserId: "user_stranger", email: "stranger@example.com" },
    "/",
  );
  await expect(stranger.getByRole("heading", { name: "You need an Invite" })).toBeVisible();
  await expectAccessible(stranger, "not a Member");
  await stranger.context().close();
});

test("the Projects screen", async ({ page }, testInfo) => {
  await signInAs(page, owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expectAccessible(page, "Projects");

  await page.getByRole("button", { name: "New project" }).click();
  await expectAccessible(page, "new Project form");

  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByText("Enter a name for the Project.")).toBeVisible();
  await expectAccessible(page, "new Project form, empty name");

  await page.route(callTo("createProject"), (route) => route.abort());
  await page.getByLabel("Project name").fill(uniqueName("Doomed", testInfo));
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not create");
  await expectAccessible(page, "failed create");
});

test("the Project screen", async ({ page }, testInfo) => {
  await signInAs(page, owner);
  await page.goto("/projects/does-not-exist");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
  await expectAccessible(page, "Project not found");

  await openNewProject(page, testInfo);
  await expect(page.getByText(/No Videos yet/)).toBeVisible();
  await expectAccessible(page, "empty Project");

  await page.getByRole("button", { name: /^Rename/ }).first().click();
  await expectAccessible(page, "renaming a Project");
  await page.reload();

  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/1080p H\.264 MP4/)).toBeVisible();
  await expectAccessible(page, "upload form");

  await page.getByLabel("Video file").evaluate((input) => {
    const big = new File(["x"], "huge.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: 21 * 1024 ** 3 });
    Object.defineProperty(input, "files", { value: [big] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText(/over the 20 GB limit/)).toBeVisible();
  await expectAccessible(page, "file refused");
});

test("a Video through upload, processing, and ready", async ({ page }, testInfo) => {
  await signInAs(page, owner);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const revisions = await routeMux(page, async () => {
    await held;
    return 200;
  });
  await openNewProject(page, testInfo);

  await startUpload(page, "Main cut");
  const uploads = page.getByRole("region", { name: "Uploads" });
  await expect(uploads.getByRole("progressbar", { name: "Uploading Main cut" })).toBeVisible();
  await expectAccessible(page, "uploading");

  release();
  await expect(uploads.getByText(/being processed/)).toBeVisible();
  const revisionId = revisions[0] as string;
  await deliver(page, "created", revisionId);
  await expect(page.getByText(/Processing/).first()).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page, "processing");

  await deliver(page, "ready", revisionId, {
    duration: 30,
    aspect_ratio: "16:9",
    playback_ids: [{ id: `pb_${revisionId}`, policy: "signed" }],
    tracks: [{ type: "video", max_frame_rate: 25 }],
  });
  await expect(page.locator(`img[src*="token=fake.t.pb_${revisionId}"]`)).toBeVisible({
    timeout: 15_000,
  });
  await expectAccessible(page, "ready Video");

  await signInAs(page, seededViewer("video_viewer", testInfo));
  await page.reload();
  await expect(page.getByText("Main cut")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expectAccessible(page, "Project as a Viewer");
});

test("a Video whose send or processing failed", async ({ page }, testInfo) => {
  await signInAs(page, owner);
  let status = 400;
  const revisions = await routeMux(page, async () => status);
  await openNewProject(page, testInfo);

  await startUpload(page, "Shaky cut");
  const uploads = page.getByRole("region", { name: "Uploads" });
  await expect(uploads.getByText(/could not be sent/)).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page, "failed send");

  status = 200;
  await uploads.getByRole("button", { name: "Retry upload of Shaky cut" }).click();
  await expect(uploads.getByText(/being processed/)).toBeVisible({ timeout: 15_000 });
  await deliver(page, "errored", revisions.at(-1) as string, {
    errors: { type: "invalid_input" },
  });
  await expect(page.getByText(/Processing failed/)).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page, "failed processing");
});

test("the Members screen", async ({ page }, testInfo) => {
  const name = uniqueName("Axe member", testInfo);
  seedMember(`user_axe_member_${testInfo.project.name}_${Date.now()}`, "viewer", name);
  await signInAs(page, owner);
  await page.goto("/members");
  await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
  await expectAccessible(page, "Members");

  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.getByRole("button", { name: `Remove ${name} now` })).toBeFocused();
  await expectAccessible(page, "confirming a removal");
  await page.getByRole("button", { name: "Keep" }).click();

  await page.getByRole("combobox", { name: `Role for ${owner.email}` }).selectOption("viewer");
  await expect(page.getByRole("alert")).toContainText("at least one Owner");
  await expectAccessible(page, "last Owner refused");

  await signInAs(page, seededViewer("member_viewer", testInfo));
  await page.goto("/members");
  await expect(page.getByText("Only an Owner can manage Members.")).toBeVisible();
  await expectAccessible(page, "Members as a Viewer");
});

test("the Invites and accept-Invite screens", async ({ page, browser }, testInfo) => {
  await signInAs(page, owner);
  const url = await createInviteLink(page);
  await expectAccessible(page, "Invite link created");

  await page.reload();
  await expect(page.getByRole("button", { name: /^Revoke/ }).first()).toBeVisible();
  await expectAccessible(page, "pending Invites");

  const member = await openAs(browser, owner, url);
  await expect(
    member.getByRole("heading", { name: "You are already on this Team" }),
  ).toBeVisible();
  await expectAccessible(member, "invite, already a Member");
  await member.context().close();

  const joining = await openAs(
    browser,
    { clerkUserId: `user_axe_join_${testInfo.project.name}_${Date.now()}`, email: "join@example.com" },
    url,
  );
  await expect(joining.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await joining.goto("/invites");
  await expect(joining.getByText("Only an Owner can manage Invites.")).toBeVisible();
  await expectAccessible(joining, "Invites as a Viewer");
  await joining.context().close();

  const late = await openAs(
    browser,
    { clerkUserId: `user_axe_late_${testInfo.project.name}_${Date.now()}`, email: "late@example.com" },
    url,
  );
  await expect(
    late.getByRole("heading", { name: "This Invite has already been used" }),
  ).toBeVisible();
  await expectAccessible(late, "invite, already used");
  await late.context().close();

  const second = await createInviteLink(page);
  await page.reload();
  await page.getByRole("button", { name: /^Revoke/ }).first().click();
  await expect(page.getByRole("heading", { name: "Pending Invites" })).toBeFocused();
  const revoked = await openAs(
    browser,
    { clerkUserId: `user_axe_revoked_${testInfo.project.name}_${Date.now()}`, email: "revoked@example.com" },
    second,
  );
  await expect(revoked.getByRole("heading", { name: "This Invite was cancelled" })).toBeVisible();
  await expectAccessible(revoked, "invite, revoked");
  await revoked.context().close();
});
