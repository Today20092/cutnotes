import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { seedComment, seedMember, seedReview, shareTokenFor } from "./support/database";
import { sampleStream } from "./support/sample-stream";
import { signInAs } from "./support/session";

async function openReview(page: Page, testInfo: TestInfo) {
  const clerkUserId = `user_a11y_${testInfo.project.name}_${Date.now()}`;
  seedMember(clerkUserId, "editor");
  const videoId = seedReview(clerkUserId);
  await signInAs(page, { clerkUserId, email: "a11y@example.com" });
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
  return { videoId, clerkUserId, open: () => page.goto(`/videos/${videoId}`) };
}

const focusIsLost = (page: Page) =>
  page.evaluate(() => document.activeElement === document.body || !document.activeElement);

for (const [screen, read] of [
  ["projects", "listProjects"],
  ["project", "getProject"],
  ["review", "getReview"],
  ["members", "getAppShell"],
  ["invites", "getAppShell"],
  ["invite", "redeemInvite"],
  ["share", "getGuestReview"],
] as const)
  test(`loading and failed ${screen} reads retain a heading and main landmark`, async ({
    page,
  }, testInfo) => {
    const { open, videoId } = await openReview(page, testInfo);
    let release = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      (url) =>
        url.pathname.includes("/_serverFn/") &&
        Buffer.from(url.pathname.split("/").pop()!, "base64url").toString().includes(read),
      async (route) => {
        await pending;
        await route.fulfill({
          status: 500,
          headers: { "x-tss-raw": "thrown" },
          json: { code: "unavailable" },
        });
      },
    );
    if (screen === "share")
      await page.addInitScript(() => localStorage.setItem("cutnotes-guest-name", "Dana"));
    if (screen === "review") await open();
    else
      await page.goto(
        screen === "projects"
          ? "/"
          : screen === "project"
            ? `/projects/${videoId}`
            : screen === "invite" || screen === "share"
              ? `/${screen}/${"0".repeat(32)}`
              : `/${screen}`,
      );
    try {
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        screen === "invite"
          ? "Joining the Team"
          : screen === "share"
            ? "Loading shared Video"
            : "Loading",
      );
    } finally {
      release();
    }
    if (screen !== "invite" && screen !== "share")
      await expect(page.getByRole("alert")).toContainText("Something went wrong");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      screen === "invite"
        ? "Something went wrong"
        : screen === "share"
          ? "This link is unavailable"
          : "Unable to load page",
    );
  });

test("Comments stay reachable at narrow widths, short heights and enlarged text", async ({
  page,
  isMobile,
}, testInfo) => {
  const { open, videoId, clerkUserId } = await openReview(page, testInfo);
  seedComment(videoId, clerkUserId, "Unbroken".repeat(20));
  await open();
  let wasLandscape = await page.evaluate(() => matchMedia("(orientation: landscape)").matches);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1280, 800],
    [320, 200],
    [740, 360],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    const landscape = width! > height!;
    if (isMobile && landscape && !wasLandscape) {
      // Rotation intentionally opens the player; exit before measuring document reflow.
      const fullscreen = page.getByRole("button", { name: "Full screen" });
      await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
      await fullscreen.click();
      await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
    }
    wasLandscape = landscape;
    for (const css of [
      "/* Default text */",
      "html{font-size:200%}",
      "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}",
    ]) {
      const style = await page.addStyleTag({ content: css });
      const field = page.getByLabel(/^Add a Comment/);
      await field.focus();
      await field.scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => ({
        pixels: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        elements: [...document.querySelectorAll("body *")]
          .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
          .slice(-10)
          .map((element) => `${element.tagName}: ${element.textContent?.slice(0, 60)}`),
      }));
      expect(
        overflow.pixels,
        `${width}×${height} ${css}: ${overflow.elements.join(", ")}`,
      ).toBeLessThanOrEqual(1);
      await expect(field).toBeInViewport();
      const exposure = await field.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          exposed: hit === element || element.contains(hit),
          top: box.top,
          height: box.height,
          hit: hit?.outerHTML.slice(0, 180),
        };
      });
      expect(
        exposure.exposed,
        `Composer exposed at ${width}×${height} ${css}: ${JSON.stringify(exposure)}`,
      ).toBe(true);
      await style.evaluate((node) => node.parentNode?.removeChild(node));
    }
  }
});

/** Relative luminance of a colour the browser resolves, by painting it (handles oklch). */
function contrast(
  page: Page,
  selector: string | Locator,
  foreground = "border-top-color",
  background = "body",
) {
  return (typeof selector === "string" ? page.locator(selector).first() : selector).evaluate(
    (element, { foreground, background }) => {
      const paint = (color: string, under?: string) => {
        const context = Object.assign(document.createElement("canvas"), {
          width: 1,
          height: 1,
        }).getContext("2d", { willReadFrequently: true })!;
        context.fillStyle = getComputedStyle(document.body).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        if (under) {
          context.fillStyle = under;
          context.fillRect(0, 0, 1, 1);
        }
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
      };
      const backgroundColor = getComputedStyle(
        background === "self" ? element : document.querySelector(background)!,
      ).backgroundColor;
      const [front, back] = [
        paint(getComputedStyle(element).getPropertyValue(foreground), backgroundColor),
        paint(backgroundColor),
      ];
      return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
    },
    { foreground, background },
  );
}

test("Comment writes are announced, name their Comment, and keep focus", async ({
  page,
}, testInfo) => {
  const { open } = await openReview(page, testInfo);
  await open();
  const status = page.locator("section[aria-labelledby=comments-heading] [role=status]");
  await page.getByLabel(/^Add a Comment/).fill("Announce me");
  await page.getByRole("button", { name: "Send Comment" }).click();
  await expect(status).toHaveText("Comment added at 0:00");
  expect(await focusIsLost(page)).toBe(false);

  await page.getByRole("button", { name: "Edit Comment by Seeded at 0:00" }).click();
  await expect(page.getByLabel("Edit Comment text")).toBeFocused();
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await page.getByRole("checkbox", { name: "Resolve Comment by Seeded at 0:00" }).click();
  await expect(status).toHaveText("Comment resolved");
  await expect(
    page.getByRole("button", { name: /^Comment at 0:00, resolved: Announce me/ }),
  ).toBeVisible();
});

test("destructive confirmations retain a contrasting keyboard focus indicator", async ({
  page,
}, testInfo) => {
  const { videoId } = await openReview(page, testInfo);
  await page.goto(`/projects/${videoId}`);
  await page.getByRole("button", { name: "More actions for Playback cut" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Video?" });
  const permanent = page.getByRole("button", { name: "Delete Playback cut permanently" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await permanent.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const indicator = await permanent.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2
        ? "outline-color"
        : "--tw-ring-color";
    });
    expect(await contrast(page, permanent, indicator), colorScheme).toBeGreaterThanOrEqual(3);
    expect(
      await contrast(page, permanent, "color", "self"),
      `${colorScheme} destructive text`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await contrast(page, dialog.locator("p").first(), "color"),
      `${colorScheme} confirmation text`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  // Axe cannot determine whether Base UI's hidden focus guards allow a Tab escape.
  for (const key of ["Tab", "Shift+Tab"])
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press(key);
      await expect
        .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
    }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More actions for Playback cut" })).toBeFocused();
});

test("consecutive Comments at the same time produce a fresh status update", async ({
  page,
}, testInfo) => {
  const { open } = await openReview(page, testInfo);
  await open();
  const status = page.locator("section[aria-labelledby=comments-heading] [role=status]");
  await page.getByLabel(/^Add a Comment/).fill("First");
  await page.getByRole("button", { name: "Send Comment" }).click();
  await expect(status).toHaveText("Comment added at 0:00");
  let release = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) =>
      url.pathname.includes("/_serverFn/") &&
      Buffer.from(url.pathname.split("/").pop()!, "base64url").toString().includes("createComment"),
    async (route) => {
      await pending;
      await route.continue();
    },
  );
  await page.getByLabel(/^Add a Comment/).fill("Second");
  await page.getByRole("button", { name: "Send Comment" }).click();
  try {
    await expect(status).toHaveText("");
  } finally {
    release();
  }
  await expect(status).toHaveText("Comment added at 0:00");
});

test("selection is visible without colour and the Comment field has a clear boundary", async ({
  page,
}, testInfo) => {
  const { open, videoId, clerkUserId } = await openReview(page, testInfo);
  seedComment(videoId, clerkUserId, "Pick me");
  await open();
  const row = page.getByRole("button", { name: /Pick me/ }).last();
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row).toHaveCSS("border-left-style", "solid");
  await expect(row).toHaveCSS("font-weight", "600");
  await expect(page.getByRole("button", { name: "To do" })).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await expect(page.getByRole("button", { name: "Resolved" })).not.toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await expect(page.getByLabel(/^Add a Comment/)).toHaveAttribute("aria-describedby", /.+/);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const measured = {
      inputBoundary: await contrast(page, "span:has(> #comment-body)"),
      selectedText: await contrast(page, "li button[aria-current=true]", "color"),
      selectedBorder: await contrast(page, "li button[aria-current=true]", "border-left-color"),
      playerText: await contrast(
        page,
        '[aria-label="Video player"] button[aria-label="Next frame"]',
        "color",
        '[aria-label="Video player"]',
      ),
    };
    await testInfo.attach(`rendered contrast ${colorScheme}`, {
      body: JSON.stringify(measured),
      contentType: "application/json",
    });
    expect(measured.inputBoundary, colorScheme).toBeGreaterThanOrEqual(3);
    expect(measured.selectedText, colorScheme).toBeGreaterThanOrEqual(4.5);
    expect(measured.selectedBorder, colorScheme).toBeGreaterThanOrEqual(3);
    expect(measured.playerText, colorScheme).toBeGreaterThanOrEqual(4.5);
  }
});

test("keyboard focus remains visible over video and in forced colours", async ({
  page,
}, testInfo) => {
  const { open } = await openReview(page, testInfo);
  await open();
  const next = page.getByRole("button", { name: "Next frame" });
  await next.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(next).toHaveCSS("outline-color", "rgb(255, 255, 255)");
  await page.locator("video").focus();
  await expect(page.locator("video")).toHaveCSS("outline-width", "2px");
  await page.emulateMedia({ forcedColors: "active" });
  const filter = page.getByRole("button", { name: "To do", exact: true });
  await filter.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(filter).toHaveCSS("outline-style", "solid");
  await expect(filter).toHaveCSS("outline-width", "2px");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  await expect(filter).toHaveCSS("transition-duration", "0s");
});

test("Comments too close to tap apart share one marker", async ({ page }, testInfo) => {
  const { open, videoId, clerkUserId } = await openReview(page, testInfo);
  seedComment(videoId, clerkUserId, "First close");
  seedComment(videoId, clerkUserId, "Second close", 2);
  await open();
  const markers = page.getByRole("group", { name: "Comment timeline markers" }).getByRole("button");
  await expect(markers).toHaveCount(1);
  await expect(markers).toHaveAccessibleName("2 Comments from 0:01");
  await markers.click();
  await expect(page.getByRole("button", { name: /First close/ }).last()).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("marker grouping grows with enlarged text targets", async ({ page }, testInfo) => {
  const { open, videoId, clerkUserId } = await openReview(page, testInfo);
  seedComment(videoId, clerkUserId, "First enlarged marker");
  seedComment(videoId, clerkUserId, "Second enlarged marker", 2, 2000);
  await page.setViewportSize({ width: 320, height: 568 });
  await open();
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await expect(
    page.getByRole("group", { name: "Comment timeline markers" }).getByRole("button"),
  ).toHaveCount(1);
});

test("removing the last shape keeps keyboard focus in the Drawing controls", async ({
  page,
}, testInfo) => {
  const { open } = await openReview(page, testInfo);
  await open();
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.readyState))
    .toBeGreaterThanOrEqual(2);
  const draw = page.getByRole("button", { name: "Draw", exact: true });
  await draw.click();
  const finish = page.getByRole("button", { name: "Finish Drawing" });
  for (const remove of ["Undo Drawing", "Clear Drawing"]) {
    // Focus in the controls unpins the player, so bring the picture back on screen before drawing.
    const picture = page.getByLabel("Drawing picture", { exact: true });
    await picture.evaluate((element) => element.scrollIntoView({ block: "start" }));
    const box = (await picture.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: remove }).focus();
    await page.keyboard.press("Enter");
    await expect(finish).toBeFocused();
  }
});

test("every view has its own title and a way past repeated controls", async ({
  page,
}, testInfo) => {
  const { open, videoId } = await openReview(page, testInfo);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(page).toHaveTitle("Projects · Cutnotes");
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(
    await page.getByRole("link", { name: "Skip to content" }).evaluate((element) => {
      const box = element.getBoundingClientRect();
      return (
        document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element
      );
    }),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.goto(`/projects/${videoId}`);
  await expect(page).toHaveTitle("Playback project · Cutnotes");
  await open();
  await expect(page).toHaveTitle("Playback cut · Cutnotes");
  await page.getByRole("link", { name: "Skip to Comments" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("section[aria-labelledby=comments-heading]")).toBeFocused();
});

test("a Guest arriving from the welcome screen lands on the heading and hears the send", async ({
  page,
  browser,
}, testInfo) => {
  const { open, videoId } = await openReview(page, testInfo);
  await open();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("Who is this link for?").fill("Client");
  await page.getByRole("button", { name: "Create Share Link" }).click();
  await expect(page.getByRole("button", { name: "Revoke link for Client" })).toBeVisible();

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/share/${shareTokenFor(videoId)}`);
  await guest.getByLabel("Your name").fill("Dana");
  await guest.getByLabel("Your name").press("Enter");
  await expect(guest.getByRole("heading", { level: 1, name: "Playback cut" })).toBeFocused();
  await guest.getByLabel(/^Add a Comment/).fill("Heard");
  await guest.getByRole("button", { name: "Send Comment" }).click();
  await expect(guest.locator("section[aria-labelledby=comments-heading] [role=status]")).toHaveText(
    "Comment added at 0:00",
  );
  await guest.context().close();
});
