import { expect, test, type Page } from "@playwright/test";
import { seedMember, seedProject, seedVideo } from "./support/database";
import { routeMux } from "./support/review-page";
import { signInAs } from "./support/session";
import { settled } from "./support/ui-sdk";

const owner = { clerkUserId: "user_first_owner", email: "first.owner@example.com" };

/** Fixed-size controls under 44 CSS pixels on a touch screen. Links inside a sentence are exempt. */
const smallTargets = (page: Page) =>
  page.evaluate(() => {
    const selector =
      "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=combobox],[role=radio],[role=checkbox]";
    return [...document.querySelectorAll(selector)]
      .filter((element) => {
        if (element.closest("[aria-hidden=true],[inert]")) return false;
        // A radio or checkbox is tapped through its label, which carries the size.
        const tapped = /^(radio|checkbox)$/.test(element.getAttribute("role") ?? "")
          ? (element.closest("label") ?? element)
          : element;
        const box = tapped.getBoundingClientRect();
        if (box.width < 2 || box.height < 2 || getComputedStyle(element).opacity === "0")
          return false; // visually hidden, such as the slider's native input
        const inSentence =
          element.tagName === "A" &&
          getComputedStyle(element).display === "inline" &&
          (element.parentElement?.textContent ?? "").trim().length >
            (element.textContent ?? "").trim().length + 3;
        return !inSentence && (box.width < 43.5 || box.height < 43.5);
      })
      .map((element) => element.outerHTML.slice(0, 120));
  });

test("on a phone every screen fits the width, logs nothing and keeps touch targets large", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "A phone-only sweep.");
  test.setTimeout(120_000);
  const suffix = `${Date.now()}`;
  const editor = `editor_sweep_${suffix}`;
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

  // Other specs seed Members whose photo URLs point nowhere; answer those so the console shows only the app's own output.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) =>
    route.request().resourceType() === "image"
      ? route.fulfill({
          contentType: "image/gif",
          body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
        })
      : route.fallback(),
  );
  await routeMux(page);
  await signInAs(page, owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  seedMember(editor, "editor", "Marco Editor");
  const project = seedProject(owner.clerkUserId, `Sweep ${suffix}`, "in_review", [
    { memberId: editor, role: "editor" },
  ]);
  const video = seedVideo(project, `Sweep cut ${suffix}`, editor);

  const screens = [
    "/",
    "/?view=list",
    "/?stage=in_review",
    "/?sheet=new-project",
    `/projects/${project}`,
    `/projects/${project}?sheet=people`,
    `/projects/${project}?sheet=rename`,
    `/videos/${video}`,
    `/videos/${video}?sheet=customer`,
    "/members",
    "/invites",
    "/settings",
    "/feedback",
  ];
  for (const url of screens) {
    await page.goto(url);
    await expect(page.locator("h1,h2").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await settled(page);
    const overflow = await page.evaluate(
      () => document.scrollingElement!.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${url} scrolls sideways`).toBeLessThanOrEqual(0);
    expect(await smallTargets(page), `${url} small targets`).toEqual([]);
  }
  expect(problems).toEqual([]);
});
