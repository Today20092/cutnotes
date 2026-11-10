import { expect, test, type Page } from "@playwright/test";
import { seedMember } from "./support/database";
import { signInAs } from "./support/session";

const owner = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

/** Holds or fails one server function, identified by its export name. */
const callTo = (name: string) => (url: URL) =>
  url.pathname.includes("/_serverFn/") &&
  Buffer.from(url.pathname.split("/").pop() as string, "base64url")
    .toString()
    .includes(name);

async function createProjectInUi(page: Page, name: string) {
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create Project" }).click();
}

test.beforeEach(async ({ page }) => {
  await signInAs(page, owner);
});

test("a created Project appears before the server answers", async ({ page }, testInfo) => {
  const name = `Instant ${testInfo.project.name} ${Date.now()}`;
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(callTo("createProject"), async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/");

  await createProjectInUi(page, name);

  await expect(page.getByText(name)).toBeVisible();
  release();
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name })).toBeVisible();
});

test("a failed create rolls back and says so", async ({ page }, testInfo) => {
  const name = `Doomed ${testInfo.project.name} ${Date.now()}`;
  await page.route(callTo("createProject"), (route) => route.abort());
  await page.goto("/");

  await createProjectInUi(page, name);

  await expect(page.getByRole("alert")).toContainText("Could not create");
  await expect(page.getByRole("link", { name })).toHaveCount(0);
});

test("an empty name is explained and nothing is sent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();

  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(page.getByText("Enter a name for the Project.")).toBeVisible();
  await expect(page.getByLabel("Project name")).toBeFocused();
});

test("a Project opens, shows the next step, and can be renamed", async ({ page }, testInfo) => {
  const name = `Open ${testInfo.project.name} ${Date.now()}`;
  const renamed = `${name} renamed`;
  await page.goto("/");
  await createProjectInUi(page, name);

  await page.getByRole("link", { name }).click();

  const heading = page.getByRole("heading", { level: 1, name });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(new RegExp(name));
  await expect(page.getByText(/No Videos yet/)).toBeVisible();

  await page.getByRole("button", { name: `Rename ${name}` }).click();
  await page.getByLabel("Project name").fill(renamed);
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
  await page
    .getByRole("navigation", { name: "breadcrumb" })
    .getByRole("link", { name: "Projects" })
    .click();
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();
});

test("a failed rename rolls back and says so", async ({ page }, testInfo) => {
  const name = `Keep ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/");
  await createProjectInUi(page, name);
  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.route(callTo("renameProject"), (route) => route.abort());

  await page.getByRole("button", { name: `Rename ${name}` }).click();
  await page.getByLabel("Project name").fill("Should not stick");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(page.getByRole("alert")).toContainText("Could not rename");
  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByText("Should not stick")).toHaveCount(0);
});

test("an unknown Project shows not found", async ({ page }) => {
  await page.goto("/projects/does-not-exist");

  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
});

test("a Viewer can browse but gets no create or rename controls", async ({ page }, testInfo) => {
  const name = `Browse ${testInfo.project.name} ${Date.now()}`;
  await page.goto("/");
  await createProjectInUi(page, name);
  await expect(page.getByRole("link", { name })).toBeVisible();

  const viewer = {
    clerkUserId: `user_viewer_${testInfo.project.name}`,
    email: "viewer@example.com",
  };
  seedMember(viewer.clerkUserId, "viewer");
  await signInAs(page, viewer);
  await page.goto("/");

  await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename/ })).toHaveCount(0);
});
