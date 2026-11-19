import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { llmsText, routeIndex } from "../../src/lib/route-index";

// The route index that /llms.txt serves must match the route files.
// shortcut: this text scan reads each `searchSchema` object, use the schema itself if it moves out of the route file.
const dir = "src/routes";
const files = readdirSync(dir, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
  .map((file) => ({ file, text: readFileSync(join(dir, file), "utf8") }));

const pages = files.flatMap(({ text }) => {
  const path = /createFileRoute\("([^"]+)"\)/.exec(text)?.[1];
  // The root, the API and the index itself are not screens.
  if (!path || path.startsWith("/api") || path === "/llms.txt") return [];
  const schema = /const searchSchema = v\.object\(\{([\s\S]*?)\n?\}\);/.exec(text)?.[1] ?? "";
  const keys = [...schema.matchAll(/(?:^|[\s,{])(\w+):\s*\w/g)].map((match) => match[1]!);
  return [{ path, keys: keys.sort() }];
});

test("the scan finds the screens", () => {
  expect(pages.length).toBeGreaterThanOrEqual(9);
});

test("every screen is in the route index, and only screens are", () => {
  expect(routeIndex.map((entry) => entry.path).sort()).toEqual(pages.map((p) => p.path).sort());
});

test.each(pages.map((page) => [page.path, page] as const))(
  "%s lists exactly its search params",
  (path, page) => {
    const entry = routeIndex.find((row) => row.path === path)!;
    expect(Object.keys(entry.params).sort()).toEqual(page.keys);
  },
);

test("the page carries no data", () => {
  const text = llmsText();
  expect(text).toContain("### /videos/$videoId");
  expect(text).not.toMatch(/user_|@[a-z]+\.[a-z]+|[0-9a-f]{8}-[0-9a-f]{4}/);
});
