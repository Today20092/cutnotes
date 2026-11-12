import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

test("project membership migration keeps creators and owners without assigning the whole team", () => {
  // CI's Bun does not implement node:sqlite; keep SQLite on the project's Node runtime.
  const result = spawnSync(
    "bun",
    ["scripts/node.ts", "test/support/check-project-members-migration.ts"],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);
});
