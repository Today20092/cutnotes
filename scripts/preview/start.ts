import { spawnSync, spawn } from "node:child_process";
import { e2eKeys } from "../../e2e/support/keys";
const migration = spawnSync(
  "bun",
  [
    "scripts/node.ts",
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    ".wrangler/e2e",
  ],
  { stdio: "inherit" },
);
if (migration.status) process.exit(migration.status);
const child = spawn(
  "bun",
  [
    "scripts/node.ts",
    "node_modules/vite/bin/vite.js",
    "dev",
    "--mode",
    "preview",
    "--port",
    "5199",
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      CLERK_JWT_KEY: e2eKeys().publicKey,
      CLERK_SECRET_KEY: "sk_live_seam2",
      CLERK_PUBLISHABLE_KEY: `pk_live_${btoa("clerk.example.test$")}`,
      APP_ORIGIN: "http://127.0.0.1:5199",
      TEAM_NAME: "Haithem Studio",
      FIRST_OWNER_EMAIL: "first.owner@example.com",
    },
    stdio: "inherit",
  },
);
child.on("exit", (code) => process.exit(code ?? 1));
