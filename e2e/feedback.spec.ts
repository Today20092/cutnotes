import { expect, test } from "@playwright/test";
import { signInAs } from "./support/session";

test.beforeEach(async ({ page }, info) => {
  // Each screen size represents a different visitor for the per-address limiter.
  await page.setExtraHTTPHeaders({
    "cf-connecting-ip": info.project.name === "phone" ? "192.0.2.80" : "192.0.2.81",
  });
});

test("signed-out feedback works without Clerk and the Owner can handle it", async ({ page }) => {
  const message = `Feedback test ${crypto.randomUUID()}`;
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Site feedback", exact: true })).toBeVisible();
  await page.evaluate(() => {
    delete window.Clerk;
  });
  const trigger = page.getByRole("button", { name: "Site feedback", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Message", { exact: true }).fill(message);
  await page.getByLabel("Message", { exact: true }).press("Tab");
  await page.keyboard.type("Test visitor");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send feedback", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Your feedback was sent" }),
  ).toBeVisible();
  await signInAs(page, { clerkUserId: "user_first_owner", email: "first.owner@example.com" });
  await page.goto("/feedback");
  const report = page.getByRole("listitem").filter({ hasText: message });
  await expect(report).toBeVisible();
  await report.getByLabel("Handled note (optional)").fill("Verified and resolved");
  await report.getByRole("button", { name: "Mark handled" }).click();
  await expect(report).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show handled reports" }).check();
  await expect(report).toBeVisible();
  await expect(report.getByText("Verified and resolved")).toBeVisible();
});

test("Members and Guests can submit using the keyboard", async ({ page }) => {
  await signInAs(page, { clerkUserId: "user_first_owner", email: "first.owner@example.com" });
  for (const path of ["/", `/share/${"a".repeat(32)}`]) {
    await page.goto(path);
    const trigger = page.getByRole("button", { name: "Site feedback", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const message = page.getByLabel("Message", { exact: true });
    await message.focus();
    await page.keyboard.type("Keyboard feedback from " + path);
    await message.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Your feedback was sent" }),
    ).toBeVisible();
  }
});

test("the stalled sign-in screen can report while Clerk never loads", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("seam2-clerk-unavailable", "1"));
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Report this problem", exact: true });
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const message = page.getByLabel("Message", { exact: true });
  await message.fill("Sign-in never loads");
  await message.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Your feedback was sent" }),
  ).toBeVisible();
});
