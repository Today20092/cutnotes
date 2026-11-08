import { spawnSync } from "node:child_process";

/** Adds a Member to the Seam 2 database, for Roles no screen can create yet. */
export function seedMember(
  clerkUserId: string,
  role: "editor" | "viewer",
  displayName = "Seeded",
) {
  executeSql(`INSERT OR IGNORE INTO members (id, clerk_user_id, display_name, role, created_at) VALUES ('${clerkUserId}', '${clerkUserId}', '${displayName}', '${role}', 1)`);
}

export function seedReview(clerkUserId: string, ready = true) {
  const id = crypto.randomUUID();
  executeSql(`
    INSERT INTO projects (id, name, created_by, created_at, updated_at) VALUES ('${id}', 'Playback project', '${clerkUserId}', 1, 1);
    INSERT INTO videos (id, project_id, title, status, created_by, created_at, updated_at) VALUES ('${id}', '${id}', 'Playback cut', 'review', '${clerkUserId}', 1, 1);
    INSERT INTO revisions (id, video_id, number, state, uploaded_by, mux_playback_id, duration_ms, frame_rate, created_at) VALUES ('${id}', '${id}', 1, '${ready ? "ready" : "processing"}', '${clerkUserId}', 'sample', 8000, 25, 1);
  `);
  return id;
}

export function seedComment(revisionId: string, memberId: string, body: string) {
  const id = crypto.randomUUID();
  executeSql(`INSERT INTO comments (id, revision_id, member_id, author_name, timecode_ms, body, created_at) VALUES ('${id}', '${revisionId}', '${memberId}', 'Other reviewer', 1000, '${body}', 1)`);
  return id;
}

export function removeSeededComment(id: string) {
  executeSql(`DELETE FROM comments WHERE id = '${id}'`);
}

function executeSql(command: string) {
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
      command,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
