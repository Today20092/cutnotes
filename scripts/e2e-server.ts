// Starts the real Worker for Seam 2 on a fresh local D1 with real migrations.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const run = (...args: string[]) =>
  spawnSync("bun", ["scripts/node.ts", ...args], { stdio: "inherit" }).status ?? 1;

rmSync(".wrangler/e2e", { recursive: true, force: true });

const migrated = run(
  "node_modules/wrangler/bin/wrangler.js",
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--persist-to",
  ".wrangler/e2e",
);
if (migrated !== 0) process.exit(migrated);

process.exit(
  run(
    "node_modules/vite/bin/vite.js",
    "dev",
    "--mode",
    "e2e",
    "--port",
    "5199",
    "--host",
    "127.0.0.1",
  ),
);
