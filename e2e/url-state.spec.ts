import { expect, test, type Page } from "@playwright/test";
import {
  seedComment,
  seedMember,
  seedProject,
  seedReadyRevision,
  seedVideo,
} from "./support/database";
import { routeMux } from "./support/review-page";
import { signInAs } from "./support/session";

// Every screen's state is in its URL: opening the URL reproduces the screen, and closing a sheet
// removes its param.
test.describe.configure({ timeout: 90_000 });

const owner = { clerkUserId: "user_first_owner", email: "first.owner@example.com" };

const dialog = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

/** Seeds a Project with a Video that has two ready Revisions, as the Owner. Revision 1 has one Comment. */
async function setUp(page: Page, testInfo: { project: { name: string } }) {
  const tag = `${testInfo.project.name}${Date.now()}`;
  await signInAs(page, owner);
  await routeMux(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  const editor = `editor_${tag}`;
  seedMember(editor, "editor", `Deep Editor ${tag}`);
  const projectName = `Deep link project ${tag}`;
  const projectId = seedProject(owner.clerkUserId, projectName, "editing", [
    { memberId: editor, role: "editor" },
  ]);
  const videoId = seedVideo(projectId, `Deep link cut ${tag}`, editor);
  seedReadyRevision(videoId, editor, 2);
  // The Revision 1 row has the Video's own ID.
  const commentId = seedComment(videoId, editor, `Check the colour ${tag}`, 1, 2000);
  return { tag, editor, projectId, projectName, videoId, commentId };
}

test("/llms.txt lists the routes and params, with no data", async ({ page, request }) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const text = await response.text();
  for (const route of [
    "/",
    "/projects/$projectId",
    "/videos/$videoId",
    "/members",
    "/share/$token",
  ])
    expect(text).toContain(`### ${route}`);
  expect(text).toContain("revision: the Revision number");
  expect(text).not.toMatch(/user_|@example|[0-9a-f]{8}-[0-9a-f]{4}/);
  // It is linked from every page's head.
  await page.goto("/");
  await expect(page.locator('link[rel="help"]')).toHaveAttribute("href", "/llms.txt");
});

test("each screen has one main, one h1 and labelled navigation", async ({ page }, testInfo) => {
  const { projectId, videoId, projectName } = await setUp(page, testInfo);
  for (const url of [
    "/",
    `/projects/${projectId}`,
    `/videos/${videoId}`,
    "/members",
    "/invites",
    "/settings",
    "/feedback",
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 }), url).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { level: 1, name: "Loading" }), url).toHaveCount(0);
    await expect(page.locator("main"), url).toHaveCount(1);
    await expect(page.locator("nav:not([aria-label]):not([aria-labelledby])"), url).toHaveCount(0);
  }
  // The board: one labelled section per Stage, and each Project is an article named by Project and Stage.
  await page.goto("/");
  for (const stage of ["New", "Editing", "In review", "Done"])
    await expect(page.getByRole("region", { name: new RegExp(`^${stage} [0-9]+$`) })).toBeVisible();
  await expect(page.getByRole("article", { name: `${projectName}, Editing` })).toBeVisible();
  await expect(page.getByRole("link", { name: projectName, exact: true }).first()).toHaveAttribute(
    "href",
    `/projects/${projectId}`,
  );
});

test("the home board's params", async ({ page }, testInfo) => {
  const { projectName } = await setUp(page, testInfo);
  const doneName = `Finished ${testInfo.project.name}${Date.now()}`;
  const doneId = seedProject(owner.clerkUserId, doneName, "done");

  // A Stage filter shows one column; an unknown value is dropped, not an error page.
  await page.goto("/?stage=editing");
  const phone = testInfo.project.name === "phone";
  if (phone) await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("editing");
  else
    await expect(page.getByRole("button", { name: /^Editing/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  await expect(page.getByRole("region", { name: /^Done \d+$/ })).toHaveCount(0);
  await expect(page.getByRole("article", { name: `${projectName}, Editing` })).toBeVisible();
  await page.goto("/?stage=nonsense&view=sideways&sheet=nothing");
  await expect(page.getByRole("region", { name: /^Done \d+$/ })).toBeVisible();
  if (phone) await page.getByLabel("Stage", { exact: true }).selectOption("in_review");
  else await page.getByRole("button", { name: /^In review/ }).click();
  await expect(page).toHaveURL(/stage=in_review/);

  // Sheets open from the URL and closing one removes its param.
  await page.goto("/?sheet=new-project");
  await expect(dialog(page, "New project")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/sheet=/);
  await page.goto("/?sheet=upload");
  await expect(dialog(page, /^Upload/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/sheet=/);
  await page.goto(`/?sheet=complete&project=${doneId}`);
  await expect(dialog(page, "Complete Project?")).toContainText(doneName);
  await page.getByRole("button", { name: "Keep open" }).click();
  await expect(page).not.toHaveURL(/sheet=|project=/);

  // The List layout is a param too; it stacks the columns.
  await page.goto("/?view=list");
  await expect(page.getByRole("region", { name: /^Done \d+$/ })).toBeVisible();
});

test("the Project page's sheets", async ({ page }, testInfo) => {
  const { projectId, projectName, videoId, tag } = await setUp(page, testInfo);
  const base = `/projects/${projectId}`;
  const cases: [string, string | RegExp][] = [
    ["people", "People"],
    ["upload", "Upload a Video"],
    ["rename", "Rename Project"],
    ["complete", "Complete Project?"],
    ["delete", "Delete Project?"],
  ];
  for (const [sheet, title] of cases) {
    await page.goto(`${base}?sheet=${sheet}`);
    await expect(dialog(page, title), sheet).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page, sheet).not.toHaveURL(/sheet=/);
  }
  // The menu writes the same URL.
  await page.getByRole("button", { name: `More actions for ${projectName}` }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await expect(page).toHaveURL(/sheet=rename$/);
  await page.getByRole("button", { name: "Close" }).click();

  // A Video's own sheets name the Video.
  await page.goto(`${base}?sheet=rename-video&video=${videoId}`);
  await expect(dialog(page, "Rename Video")).toBeVisible();
  await expect(page.getByLabel("Video title", { exact: true })).toHaveValue(`Deep link cut ${tag}`);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/sheet=|video=/);
  await page.goto(`${base}?sheet=delete-video&video=${videoId}`);
  await expect(dialog(page, "Delete Video?")).toBeVisible();
  await page.goto(`${base}?sheet=bogus`);
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the review page's params", async ({ page }, testInfo) => {
  const { videoId, commentId, tag } = await setUp(page, testInfo);
  const base = `/videos/${videoId}`;
  const open = async (query: string) => {
    await page.goto(`${base}${query}`);
    await expect(page.getByRole("heading", { level: 1, name: `Deep link cut ${tag}` })).toBeVisible(
      { timeout: 20_000 },
    );
  };
  const pressed = (name: string) => page.getByRole("button", { name, exact: true });
  const currentTime = () =>
    page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime);

  // The latest Revision by default, then named in the URL; `revision` picks one; a number with
  // no ready Revision opens nothing and links to the latest.
  await open("");
  await expect(pressed("Revision 2 · 0 to do")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/revision=2/);
  await page.getByRole("link", { name: "Revision 1 has 1 Comment to do." }).click();
  await expect(page).toHaveURL(/revision=1#comments/);
  await expect(page.getByRole("link", { name: "Other reviewer" })).toHaveAttribute(
    "href",
    /members\?q=Other(?:%20|\+)reviewer/,
  );
  await open("?revision=1");
  await expect(pressed("Revision 1 · 1 to do")).toHaveAttribute("aria-pressed", "true");
  await open("?revision=99&t=banana");
  await expect(page.getByText("Revision 99 cannot be opened.")).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("link", { name: "Watch Revision 2" }).click();
  await expect(pressed("Revision 2 · 0 to do")).toHaveAttribute("aria-pressed", "true");
  await pressed("Revision 1 · 1 to do").click();
  await expect(page).toHaveURL(/revision=1/);
  await page.getByRole("link", { name: "Watch it" }).click();
  await expect(page).toHaveURL(/revision=2/);

  // Selecting a Comment writes it to the URL; a link opens with it selected, at its time.
  await open("?revision=1");
  await page.locator(`#comment-${commentId} button`).first().click();
  await expect(page).toHaveURL(new RegExp(`comment=${commentId}`));
  await open(`?revision=1&comment=${commentId}`);
  await expect(page.locator(`#comment-${commentId} button`).first()).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect.poll(currentTime).toBeCloseTo(2, 0);

  // `t` seeks without selecting; `filter` shows Resolved.
  await open("?revision=1&t=5");
  await expect.poll(currentTime).toBeCloseTo(5, 0);
  await open("?revision=1&filter=resolved");
  await expect(pressed("Resolved")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("No Resolved Comments.")).toBeVisible();
  await pressed("To do (1)").click();
  await expect(page).not.toHaveURL(/filter=/);

  // Sheets. The customer sheet names the Revision it sends in the URL, and never swaps it.
  await open("?sheet=customer");
  await expect(page).toHaveURL(/revision=2/);
  await expect(dialog(page, "Send to customer")).toContainText(
    `Sends Revision 2 of Deep link cut ${tag}`,
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/sheet=/);
  await open("?revision=1");
  await page.getByRole("button", { name: "Send to customer" }).click();
  await expect(page).toHaveURL(/revision=1/);
  await expect(dialog(page, "Send to customer")).toContainText(
    `Sends Revision 1 of Deep link cut ${tag}`,
  );
  await open("?sheet=customer&revision=99");
  await expect(dialog(page, "Send to customer")).toContainText("Revision 99");
  await expect(dialog(page, "Send to customer")).toContainText("This Revision cannot be sent.");
  await expect(page.getByLabel("Who is this link for?")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await open("?sheet=upload");
  await expect(dialog(page, /^Upload .* again$/)).toBeVisible();
  // The ⋯ menu's Export markers sheet.
  await open("?sheet=markers");
  await expect(dialog(page, "Export Premiere markers")).toContainText("Revision 2.");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/sheet=/);
  await expect(
    page.getByRole("button", { name: `More actions for Deep link cut ${tag}` }),
  ).toBeFocused();
});

test("the Team, Invites and Site feedback params", async ({ page }, testInfo) => {
  const { editor, projectId, tag } = await setUp(page, testInfo);

  await page.goto(`/members?q=Deep Editor ${tag}`);
  await expect(page.getByLabel("Search the Team")).toHaveValue(`Deep Editor ${tag}`);
  await expect(page.getByRole("listitem").filter({ hasText: `Deep Editor ${tag}` })).toHaveCount(1);
  await expect(page.getByText("first.owner@example.com")).toHaveCount(0);
  await page.getByLabel("Search the Team").fill("zzz-nobody");
  await expect(page).toHaveURL(/q=zzz-nobody/);
  await expect(page.getByText(/No one on the Team matches/)).toBeVisible();
  await page.goto(`/members?remove=${editor}`);
  await expect(dialog(page, `Remove Deep Editor ${tag}?`)).toBeVisible();
  await page.getByRole("button", { name: "Keep Member" }).click();
  await expect(page).not.toHaveURL(/remove=/);

  await page.goto(`/invites?project=${projectId}`);
  await expect(page.getByText("Showing Invites for one Project.")).toBeVisible();
  await page.goto("/invites?project=");
  await expect(page.getByRole("heading", { level: 1, name: "Invites" })).toBeVisible();

  await page.goto("/feedback?handled=true");
  await expect(page.getByRole("checkbox", { name: "Show handled reports" })).toBeChecked();
  await page.goto("/feedback?handled=maybe");
  await expect(page.getByRole("checkbox", { name: "Show handled reports" })).not.toBeChecked();
});
