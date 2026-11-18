import { expect, type Page } from "@playwright/test";
import { seedMember, seedReview } from "./database";
import { sampleStream } from "./sample-stream";
import { signInAs } from "./session";

/** Signs in a new Editor with one seeded, playable Video. Returns its ID (also its Revision's). */
export async function signInWithReview(page: Page) {
  const clerkUserId = `user_uisdk_${crypto.randomUUID()}`;
  seedMember(clerkUserId, "editor", "Reviewer");
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
  return { id, clerkUserId };
}

export async function openVideo(page: Page, id: string, query = "") {
  await page.goto(`/videos/${id}${query}`);
  // The first page after the dev server starts compiles on demand.
  await expect(page.getByRole("heading", { name: "Playback cut" })).toBeVisible({
    timeout: 15_000,
  });
}

/** The text of ui-sdk's shared live regions, where `announce` writes. */
export const announcements = (page: Page) =>
  page.locator("[aria-live]").evaluateAll((regions) => regions.map((r) => r.textContent).join(" "));

/** The queue sits in a closed Collapsible so the Comment list isn't shown twice. */
export async function openQueue(page: Page) {
  await page.getByRole("button", { name: /^Review queue/ }).click();
  return page.getByRole("list", { name: "Open notes" });
}
