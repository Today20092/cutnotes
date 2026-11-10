import { env } from "cloudflare:workers";
import { and, gt, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import { revisions } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";
import { reconcileRevision } from "@/server/revision-lifecycle";

const CHUNK = 1000;

/** Finish remote cleanup before allowing a Revision's row to disappear. */
async function removeMedia(revision: {
  mux_asset_id: string | null;
  mux_upload_id: string | null;
}) {
  const mux = getMuxGateway();
  let assetId = revision.mux_asset_id;
  if (!assetId && revision.mux_upload_id) {
    const upload = await mux.getDirectUpload(revision.mux_upload_id);
    assetId = upload?.asset_id ?? null;
    if (!assetId && upload && !["cancelled", "errored", "timed_out"].includes(upload.status)) {
      // Cancellation can race asset creation. Keep the row and discover it next run.
      if (!(await mux.cancelDirectUpload(revision.mux_upload_id))) return false;
    }
  }
  if (assetId) await mux.deleteAsset(assetId);
  return true;
}

export async function runHourly(now: number) {
  // Claim due Projects before touching Mux, so a concurrent Reopen cannot revive deleted media.
  await env.DB.prepare(
    "UPDATE projects SET deleted_at = ? WHERE deleted_at IS NULL AND delete_after <= ?",
  )
    .bind(now, now)
    .run();
  let cursor = "";
  for (;;) {
    const page = await getDb()
      .select()
      .from(revisions)
      .where(and(gt(revisions.id, cursor), inArray(revisions.state, ["uploading", "processing"])))
      .orderBy(revisions.id)
      .limit(CHUNK);
    if (!page.length) break;
    for (const revision of page) {
      try {
        await reconcileRevision(revision, now);
      } catch {
        console.error("Revision reconciliation failed", revision.id);
      }
    }
    cursor = page[page.length - 1]!.id;
  }

  cursor = "";
  for (;;) {
    const { results } =
      await env.DB.prepare(`SELECT r.id, r.state, r.created_at, r.mux_asset_id, r.mux_upload_id,
      (v.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL) AS deleted
      FROM revisions r JOIN videos v ON v.id = r.video_id JOIN projects p ON p.id = v.project_id
      WHERE r.id > ? AND (v.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL
        OR (r.state = 'errored' AND (r.mux_asset_id IS NOT NULL OR r.mux_upload_id IS NOT NULL)))
      ORDER BY r.id LIMIT ${CHUNK}`)
        .bind(cursor)
        .all<{
          id: string;
          state: string;
          created_at: number;
          mux_asset_id: string | null;
          mux_upload_id: string | null;
          deleted: number;
        }>();
    if (!results.length) break;
    const removed: string[] = [];
    for (const revision of results) {
      try {
        // startUpload may still be saving the direct-upload ID returned by Mux.
        if (
          revision.state === "uploading" &&
          !revision.mux_upload_id &&
          !revision.mux_asset_id &&
          revision.created_at > now - 24 * 60 * 60 * 1000
        )
          continue;
        if (!(await removeMedia(revision))) continue;
        if (revision.deleted) removed.push(revision.id);
        else
          await env.DB.prepare(
            "UPDATE revisions SET mux_asset_id = NULL, mux_upload_id = NULL WHERE id = ? AND state = 'errored'",
          )
            .bind(revision.id)
            .run();
      } catch {
        console.error("Revision media cleanup failed", revision.id);
      }
    }
    // One JSON parameter keeps 1,000-row deletes within D1's binding limit.
    if (removed.length)
      await env.DB.prepare("DELETE FROM revisions WHERE id IN (SELECT value FROM json_each(?))")
        .bind(JSON.stringify(removed))
        .run();
    cursor = results[results.length - 1]!.id;
  }
  for (;;) {
    const result = await env.DB.prepare(`DELETE FROM videos WHERE id IN (
      SELECT v.id FROM videos v JOIN projects p ON p.id = v.project_id
      WHERE (v.deleted_at IS NOT NULL OR p.deleted_at IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM revisions r WHERE r.video_id = v.id) LIMIT ${CHUNK})`).run();
    if (result.meta.changes === 0) break;
  }
  for (;;) {
    const result = await env.DB.prepare(`DELETE FROM projects WHERE id IN (
      SELECT p.id FROM projects p WHERE p.deleted_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM videos v WHERE v.project_id = p.id) LIMIT ${CHUNK})`).run();
    if (result.meta.changes === 0) break;
  }
}
