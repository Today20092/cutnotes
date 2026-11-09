import { expect, test } from "@playwright/test";
import { sessionToken, signInAs } from "./support/session";

// Runs first in each project's file order: the first sign-in creates the Owner,
// and the fresh database is shared by both widths, so the Owner identity is the same.
const owner = {
  clerkUserId: "user_first_owner",
  email: "first.owner@example.com",
};

test("the first Owner reaches the app shell with the Team name", async ({ page }, testInfo) => {
  await signInAs(page, owner);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  // Phone runs first, on the empty database both widths share.
  if (testInfo.project.name === "phone") {
    await expect(page.getByText(/No Projects yet/)).toBeVisible();
  }
  await expect(page.getByText("Haithem Studio").first()).toBeVisible();
  await expect(page.locator('img[src^="data:image/gif"]').first()).toBeAttached();

  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }),
  ).toBeVisible();
});

test("Sign out lives in Settings, not the navigation", async ({ page }) => {
  await signInAs(page, owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeFocused();
  await expect(page.getByRole("link", { name: "Invites" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("every server call carries a Bearer token, even with an expired cookie", async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(page, owner);
  await context.addCookies([
    {
      name: "__session",
      value: sessionToken(owner, -300),
      // Server calls only: on a page load Clerk would answer with its handshake redirect.
      domain: new URL(baseURL as string).hostname,
      path: "/_serverFn",
    },
  ]);
  const call = page.waitForRequest((request) => request.url().includes("/_serverFn/"));

  await page.goto("/");

  expect((await call).headers().authorization).toMatch(/^Bearer /);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});

test("a signed-in non-Member sees the Not a Member screen", async ({ page }) => {
  await signInAs(page, {
    clerkUserId: "user_stranger",
    email: "stranger@example.com",
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "You need an Invite" })).toBeVisible();
});

test("a signed-out visitor sees the sign-in screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("the app follows the device dark setting", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAs(page, owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: "light" });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(dark).not.toBe(light);
});
