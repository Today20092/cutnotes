import { spawnSync } from "node:child_process";

/** Adds a Member to the Seam 2 database, for Roles no screen can create yet. */
export function seedMember(
  clerkUserId: string,
  role: "editor" | "viewer",
  displayName = "Seeded",
) {
  const result = spawnSync(
    "bun",
    [
      "scripts/node.ts",
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      ".wrangler/e2e",
      "--command",
      `INSERT OR IGNORE INTO members (id, clerk_user_id, display_name, role, created_at) VALUES ('${clerkUserId}', '${clerkUserId}', '${displayName}', '${role}', 1)`,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
