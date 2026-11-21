import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// A lint suppression must say why, after " -- ", so it cannot silently hide a bug.
const suppressions = ["src", "test", "e2e", "scripts"]
  .flatMap((dir) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" }).map((file) => join(dir, file)),
  )
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith("routeTree.gen.ts"))
  .flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) =>
        /(oxlint|eslint)-disable/.test(line) ? [{ at: `${file}:${index + 1}`, line }] : [],
      ),
  );

test.each(suppressions.map((s) => [s.at, s.line] as const))("%s gives a reason", (at, line) => {
  expect(
    /(oxlint|eslint)-disable\S*\s+\S+.*\s--\s+\S/.test(line),
    `${at}: add " -- <reason>" after the rule name, for example "// oxlint-disable-next-line <rule> -- <why this case is safe>".`,
  ).toBe(true);
});
