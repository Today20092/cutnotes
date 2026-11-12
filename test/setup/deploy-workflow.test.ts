import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const selection = workflow
  .match(
    /      - name: Select a passing current branch commit[\s\S]*?        run: \|\r?\n([\s\S]*?)(?=\r?\n  deploy:)/,
  )![1]!
  .split("\n")
  .map((line) => line.slice(10))
  .join("\n");
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";

function select(overrides: Record<string, string | undefined>) {
  const dir = mkdtempSync(join(tmpdir(), "cutnotes-deploy-"));
  const output = join(dir, "output").replaceAll("\\", "/");
  try {
    const result = spawnSync(
      bash,
      [
        "-c",
        `gh() { if [[ "$2" == */branches/* ]]; then echo "$CURRENT_SHA"; else echo "$CHECK_CONCLUSION"; fi; }\n${selection}`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          EVENT: "workflow_run",
          CHECKED_BRANCH: "main",
          CHECKED_SHA: "tested",
          CURRENT_SHA: "tested",
          CHECK_CONCLUSION: "success",
          REPOSITORY: "example/cutnotes",
          GITHUB_OUTPUT: output,
          ...overrides,
        },
      },
    );
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: result.status === 0 ? readFileSync(output, "utf8") : "",
    };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

test("passing main and development pushes automatically select their own installs", () => {
  expect(workflow).toContain("branches: [main, development]");
  expect(select({})).toEqual({ status: 0, output: "environment=production\nsha=tested\n" });
  expect(select({ CHECKED_BRANCH: "development" })).toEqual({
    status: 0,
    output: "environment=staging\nsha=tested\n",
  });
});

test.each([
  { CHECKED_BRANCH: "feature" },
  { CURRENT_SHA: "newer" },
  { CHECK_CONCLUSION: "failure" },
  {
    EVENT: "workflow_dispatch",
    REQUESTED_ENVIRONMENT: "production",
    REQUESTED_REF: "refs/heads/development",
    REQUESTED_SHA: "tested",
  },
])("refuses an invalid or stale deployment candidate %j", (overrides) => {
  expect(select(overrides).status).not.toBe(0);
});

test("manual retry deploys a passing main commit without another approval input", () => {
  expect(
    select({
      EVENT: "workflow_dispatch",
      REQUESTED_ENVIRONMENT: "production",
      REQUESTED_REF: "refs/heads/main",
      REQUESTED_SHA: "tested",
    }),
  ).toEqual({ status: 0, output: "environment=production\nsha=tested\n" });
});
