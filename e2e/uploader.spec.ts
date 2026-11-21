import { expect, test } from "@playwright/test";
import { seedComment, seedMember, seedUploaderProject } from "./support/database";
import { sampleStream } from "./support/sample-stream";
import { signInAs } from "./support/session";

test("an Uploader reviews an assigned Project but manages only the Videos they created", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const uploader = { clerkUserId: `uploader_${suffix}`, email: `uploader.${suffix}@example.com` };
  const other = `editor_${suffix}`;
  seedMember(uploader.clerkUserId, "viewer", uploader.email);
  seedMember(other, "editor", "Another editor");
  const seeded = seedUploaderProject(uploader.clerkUserId, other, suffix);
  seedComment(seeded.others, other, `Needs a cut ${suffix}`);
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

  await signInAs(page, uploader);
  await page.goto("/");
  await page.getByRole("link", { name: `Uploader project ${suffix}`, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Uploader project ${suffix}`);
  // An Uploader can upload a Revision only to a Video they created.
  await expect(page.getByRole("combobox", { name: /^Status/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Stage:/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `More actions for Their cut ${suffix}` }),
  ).toHaveCount(0);
  const more = page.getByRole("button", { name: `More actions for My cut ${suffix}` });
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Upload new Revision" }).click();
  const upload = page.getByRole("dialog", { name: `Upload My cut ${suffix} again` });
  await expect(upload).toBeVisible();
  await upload.getByRole("button", { name: "Close" }).click();
  await expect(more).toBeFocused();

  await page.getByRole("link", { name: `Their cut ${suffix}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Their cut ${suffix}`, level: 1 })).toBeVisible();
  await expect(page.getByText(`Needs a cut ${suffix}`)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Status/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /^(Resolve|Unresolve)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload new Revision" })).toHaveCount(0);

  const comment = `Uploader note ${suffix}`;
  await page.getByLabel(/^Add a Comment at/).fill(comment);
  await page.getByRole("button", { name: "Send Comment", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Edit Comment/ })).toBeEnabled();
  await expect(page.getByRole("list", { name: "Comments" }).getByText(comment)).toBeVisible();

  await page.goto(`/videos/${seeded.own}`);
  await expect(page.getByRole("heading", { name: `My cut ${suffix}`, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload new Revision" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Status/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Rename/ })).toHaveCount(0);
});
