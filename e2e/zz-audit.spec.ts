// Opt-in extended audit; the regular accessibility specs are the fast regression gate.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { seedComment, seedMember, seedReview, shareTokenFor } from "./support/database";
import { sampleStream } from "./support/sample-stream";
import { signInAs } from "./support/session";

const out = process.env.AUDIT_OUT!;
const log = (project: string, check: string, detail: unknown) =>
  appendFileSync(out, JSON.stringify({ project, check, detail }) + "\n");

async function prepare(page: Page, name: string) {
  const clerkUserId = `user_zz_${name}_${Date.now()}`;
  seedMember(clerkUserId, "editor");
  const id = seedReview(clerkUserId);
  seedComment(
    id,
    clerkUserId,
    "Averyveryveryveryveryveryveryveryveryveryveryveryverylongunbrokenwordthatmustwrapinsidethelist",
  );
  await signInAs(page, { clerkUserId, email: "zz@example.com" });
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
  return id;
}

const spacing =
  "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";

const measure = async (page: Page) => {
  // ResizeObserver aligns the Drawing with the resized picture on the next render.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate(() => {
    const root = document.documentElement;
    const composer = document.querySelector("#comment-body")?.getBoundingClientRect();
    const clipped = [...document.querySelectorAll("h1,h2,p,a,button,label,li")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          element.getBoundingClientRect().width > 1 &&
          style.overflow !== "visible" &&
          element.scrollWidth > element.clientWidth + 1
        );
      })
      .map((element) => element.tagName + ":" + (element.textContent ?? "").slice(0, 30));
    const overflow =
      root.scrollWidth > root.clientWidth + 1
        ? [...document.querySelectorAll("body *")]
            .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
            .slice(-8)
            .map((element) => `${element.tagName}: ${element.textContent?.slice(0, 60)}`)
        : [];
    return {
      width: innerWidth,
      height: innerHeight,
      sideScroll: root.scrollWidth - root.clientWidth,
      docHeight: root.scrollHeight,
      composerBottom: composer && composer.bottom + scrollY,
      clipped,
      overflow,
    };
  });
};

/** Tabs through the page; a stop is obscured when the element at its centre is not it or its relative. */
async function tabStops(page: Page, limit: number) {
  const problems: string[] = [];
  let stops = 0;
  for (let index = 0; index < limit; index++) {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const style = getComputedStyle(element);
      const inView = box.bottom > 0 && box.top < innerHeight;
      return {
        name:
          element.tagName +
          ":" +
          (element.getAttribute("aria-label") ?? element.textContent ?? "").slice(0, 30),
        covered: inView && !!hit && !element.contains(hit) && !hit.contains(element),
        inView,
        indicator:
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          style.boxShadow !== "none",
      };
    });
    if (!result) continue;
    stops++;
    if (result.covered || !result.inView) problems.push("obscured " + result.name);
    if (!result.indicator) problems.push("no indicator " + result.name);
  }
  return { stops, problems: [...new Set(problems)] };
}

test("audit matrix", async ({ page, browser }, testInfo) => {
  test.skip(!process.env.AUDIT_OUT, "Set AUDIT_OUT and AUDIT_SHOTS to run the extended audit.");
  test.setTimeout(600_000);
  const project = testInfo.project.name;
  const id = await prepare(page, project);
  const urls: [string, string][] = [
    ["projects", "/"],
    ["project", `/projects/${id}`],
    ["review", `/videos/${id}`],
    ["members", "/members"],
    ["invites", "/invites"],
  ];

  await page.goto(`/videos/${id}`);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Who is this link for?").fill("Client");
  await page.getByRole("button", { name: "Create Share Link" }).click();
  await page.getByRole("button", { name: "Revoke link for Client" }).waitFor();
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await guestContext.newPage();
  await guest.addInitScript(() => localStorage.setItem("cutnotes-guest-name", "Dana"));
  const guestUrl = `/share/${shareTokenFor(id)}`;

  const sizes: [string, number, number][] = [
    ["320", 320, 568],
    ["phone", 390, 844],
    ["tablet", 768, 1024],
    ["desktop", 1280, 800],
    ["400zoom-equivalent", 320, 200],
    ["200zoom-equivalent", 640, 400],
    ["landscape", 740, 360],
    ["keyboard", 390, 460],
  ];
  for (const [label, width, height] of sizes)
    for (const [screen, url] of [...urls, ["guest", guestUrl] as [string, string]]) {
      const target = screen === "guest" ? guest : page;
      await target.setViewportSize({ width, height });
      await target.goto(url);
      await target.getByRole("heading", { level: 1 }).first().waitFor();
      await target.waitForTimeout(400);
      const plain = await measure(target);
      expect.soft(plain.sideScroll, `${screen} ${label}`).toBeLessThanOrEqual(1);
      if (plain.sideScroll > 0 || plain.clipped.length)
        log(project, `layout ${screen} ${label}`, plain);
      if (["review", "guest"].includes(screen))
        log(project, `composer ${screen} ${label}`, {
          docHeight: plain.docHeight,
          composerBottom: plain.composerBottom,
        });
      const style = await target.addStyleTag({ content: spacing });
      const spaced = await measure(target);
      expect.soft(spaced.sideScroll, `spacing ${screen} ${label}`).toBeLessThanOrEqual(1);
      if (spaced.sideScroll > 0 || spaced.clipped.length)
        log(project, `spacing ${screen} ${label}`, spaced);
      await style.evaluate((node) => node.parentNode?.removeChild(node));
      await target.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const text = await measure(target);
      expect.soft(text.sideScroll, `200% text ${screen} ${label}`).toBeLessThanOrEqual(1);
      if (text.sideScroll > 0 || text.clipped.length)
        log(project, `200%text ${screen} ${label}`, text);
      await target.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      if (["320", "phone", "landscape", "desktop"].includes(label) && project !== "x") {
        await target.goto(url);
        await target.getByRole("heading", { level: 1 }).first().waitFor();
        await target.waitForTimeout(300);
        const result = await tabStops(target, 45);
        log(project, `tab ${screen} ${label}`, result);
      }
    }

  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [screen, url] of [...urls, ["guest", guestUrl] as [string, string]]) {
    const target = screen === "guest" ? guest : page;
    await target.goto(url);
    await target.getByRole("heading", { level: 1 }).first().waitFor();
    for (const colorScheme of ["light", "dark"] as const) {
      await target.emulateMedia({ colorScheme });
      await target.waitForTimeout(300);
      const { violations, incomplete } = await new AxeBuilder({ page: target })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      log(project, `axe ${screen} ${colorScheme}`, {
        violations: violations.map(
          (v) => `${v.id}×${v.nodes.length}:${v.nodes[0]!.target.join(" ")}`,
        ),
        incomplete: incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
        })),
      });
      expect.soft(violations, `${screen} ${colorScheme}`).toEqual([]);
    }
    await target.emulateMedia({
      colorScheme: "light",
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await target.waitForTimeout(200);
    await target.screenshot({
      path: `${process.env.AUDIT_SHOTS}/${project}-${screen}-forced.png`,
      fullPage: true,
    });
    await target.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
  }

  // Over-video and row contrast from rendered colours.
  await page.goto(`/videos/${id}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page
    .getByRole("button", { name: /Averyvery/ })
    .last()
    .click();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.waitForTimeout(250);
    log(
      project,
      `selected ${colorScheme}`,
      await page.evaluate(() => {
        const row = document.querySelector("li button[aria-current=true]")!;
        const style = getComputedStyle(row);
        const ring = document.querySelector<HTMLElement>("[role=region] button")!;
        ring.focus();
        return {
          color: style.color,
          bg: getComputedStyle(document.body).backgroundColor,
          weight: style.fontWeight,
          bar: style.borderLeftWidth + style.borderLeftColor,
          ringOutline: getComputedStyle(ring).outlineColor,
          ringWidth: getComputedStyle(ring).outlineWidth,
        };
      }),
    );
  }
  await guestContext.close();
});
