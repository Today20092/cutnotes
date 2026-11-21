import { expect, test } from "@playwright/test";
import { seedComment, seedMember, seedReview } from "./support/database";
import { signInAs } from "./support/session";

const photo = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const owner = { clerkUserId: "user_first_owner", email: "first.owner@example.com" };

test("cnippet avatars show photos and retain initials when a photo fails", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const editorId = `user_avatar_${suffix}`;
  seedMember(editorId, "editor", `Dana ${suffix}`, photo);
  seedMember(
    `user_broken_${suffix}`,
    "viewer",
    `Robin ${suffix}`,
    "https://photos.example.test/missing.png",
  );
  await page.route("https://photos.example.test/**", (route) => route.abort());
  await signInAs(page, owner);
  await page.goto("/members");
  const dana = page.getByRole("listitem").filter({ hasText: `Dana ${suffix}` });
  await expect(dana.locator('[data-slot="avatar-image"]')).toBeVisible();
  const robin = page.getByRole("listitem").filter({ hasText: `Robin ${suffix}` });
  await expect(robin.locator('[data-slot="avatar-fallback"]')).toHaveText("R");

  const videoId = seedReview(editorId);
  seedComment(videoId, editorId, "An editor with a photo");
  await page.goto(`/videos/${videoId}`);
  const comment = page
    .getByRole("list", { name: "Comments", exact: true })
    .getByRole("listitem")
    .filter({ hasText: "An editor with a photo" });
  await expect(comment.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(comment).toContainText("Other reviewer");
});

test("the account avatar opens Settings and Manage profile opens Clerk", async ({
  page,
}, testInfo) => {
  const person = {
    clerkUserId: `user_account_${testInfo.project.name}_${Date.now()}`,
    email: "dana@example.com",
  };
  seedMember(person.clerkUserId, "viewer", "Dana Editor", photo);
  await signInAs(page, person);
  await page.goto("/");
  const account = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Settings" });
  await expect(account.locator('[data-slot="avatar-image"]')).toBeVisible();
  await account.click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  const dialog = page.waitForEvent("dialog");
  const click = page.getByRole("button", { name: "Manage profile" }).click();
  const opened = await dialog;
  expect(opened.message()).toBe("Manage Clerk profile");
  await opened.accept();
  await click;
});
