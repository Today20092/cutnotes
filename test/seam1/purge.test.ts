import { env } from "cloudflare:workers";
import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import worker from "@/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeMux, fakeSignature } from "./support/fake-mux";
import { postWebhook } from "./support/worker";
import { clearDatabase, seedMember, seedProject, seedRevision, seedVideo } from "./support/seed";

const tick = async () => {
  const context = createExecutionContext();
  await worker.scheduled(createScheduledController({ scheduledTime: Date.now(), cron: "0 * * * *" }));
  await waitOnExecutionContext(context);
};
const rows = async (table: string) => (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
beforeEach(async () => {
  await clearDatabase();
  await seedMember("owner");
  await seedProject("p");
  await seedVideo("v", "p", 1);
  await seedRevision({ id: "r", videoId: "v", state: "ready", assetId: "a" });
});
afterEach(() => vi.restoreAllMocks());

it("keeps rows on Mux failure and retries Mux before removing rows", async () => {
  const remove = vi.spyOn(fakeMux, "deleteAsset").mockImplementationOnce(async () => {
    expect(await rows("revisions")).toHaveLength(1);
    throw new Error("Mux unavailable");
  });
  await tick();
  expect(await rows("videos")).toHaveLength(1);
  await tick();
  expect(remove).toHaveBeenCalledTimes(2);
  expect(await rows("videos")).toEqual([]);
  await tick();
  expect(await rows("projects")).toHaveLength(1);
});

it("recovers a missed upload and ready webhook", async () => {
  await env.DB.exec("UPDATE videos SET deleted_at = NULL; UPDATE revisions SET state = 'uploading', mux_asset_id = NULL, mux_upload_id = 'u';");
  vi.spyOn(fakeMux, "getDirectUpload").mockResolvedValue({ status: "asset_created", asset_id: "a" });
  vi.spyOn(fakeMux, "getAsset").mockResolvedValue({ id: "a", status: "ready", duration: 30, playback_ids: [{ id: "pb", policy: "signed" }] });
  await tick();
  expect(await rows("revisions")).toMatchObject([{ state: "ready", mux_asset_id: "a", mux_playback_id: "pb" }]);
});

it("times out abandoned uploads and processing, preserving a retryable failed Revision", async () => {
  await env.DB.exec("UPDATE videos SET deleted_at = NULL; UPDATE revisions SET state = 'uploading', mux_asset_id = NULL, mux_upload_id = 'u';");
  const cancel = vi.spyOn(fakeMux, "cancelDirectUpload");
  await tick();
  expect(cancel).toHaveBeenCalledWith("u");
  expect(await rows("revisions")).toMatchObject([{ state: "errored", error_code: "timed-out", mux_upload_id: null }]);
  await env.DB.exec("UPDATE revisions SET state = 'processing', mux_asset_id = 'a';");
  await tick();
  expect(await rows("revisions")).toMatchObject([{ state: "errored", mux_asset_id: null }]);
});

it("purges the Mux asset of an over-12-hour cut but leaves its failure and retry path", async () => {
  await env.DB.exec("UPDATE videos SET deleted_at = NULL; UPDATE revisions SET state = 'processing';");
  vi.spyOn(fakeMux, "getAsset").mockResolvedValue({ id: "a", status: "ready", duration: 43201 });
  const remove = vi.spyOn(fakeMux, "deleteAsset");
  await tick();
  expect(remove).toHaveBeenCalledWith("a");
  expect(await rows("revisions")).toMatchObject([{ state: "errored", error_code: "too-long", mux_asset_id: null }]);
});

it("does not lose a deleted upload whose cancellation races asset creation", async () => {
  await env.DB.exec("UPDATE revisions SET state = 'uploading', mux_asset_id = NULL, mux_upload_id = 'u';");
  vi.spyOn(fakeMux, "cancelDirectUpload").mockResolvedValue(false);
  await tick();
  expect(await rows("revisions")).toHaveLength(1);
  vi.spyOn(fakeMux, "getDirectUpload").mockResolvedValue({ status: "asset_created", asset_id: "a" });
  const remove = vi.spyOn(fakeMux, "deleteAsset");
  await tick();
  expect(remove).toHaveBeenCalledWith("a");
  expect(await rows("revisions")).toEqual([]);
});

it("claims due Projects, keeps reopened Projects and drains more than one chunk", async () => {
  await env.DB.exec("UPDATE projects SET delete_after = 1; UPDATE videos SET deleted_at = NULL;");
  await seedProject("reopened");
  await env.DB.exec("UPDATE projects SET completed_at = NULL, delete_after = NULL WHERE id = 'reopened';");
  for (let offset = 0; offset < 1100; offset += 50) {
    await env.DB.batch(Array.from({ length: 50 }, (_, index) => env.DB.prepare("INSERT INTO videos (id,project_id,title,status,created_by,created_at,updated_at) VALUES (?,'p','Cut','review','member_owner',1,1)").bind(`v${offset + index}`)));
  }
  await env.DB.exec("INSERT INTO revisions (id,video_id,number,state,uploaded_by,created_at) SELECT 'r_' || id,id,1,'ready','member_owner',1 FROM videos WHERE id <> 'v';");
  await tick();
  expect(await rows("revisions")).toEqual([]);
  expect(await rows("videos")).toEqual([]);
  expect(await rows("projects")).toMatchObject([{ id: "reopened" }]);
});

it("retains a recent Revision until its in-flight direct upload has an ID", async () => {
  await env.DB.prepare("UPDATE revisions SET state = 'uploading', mux_asset_id = NULL, created_at = ?").bind(Date.now()).run();
  await tick();
  expect(await rows("revisions")).toHaveLength(1);
});

it("leaves unfinished state alone on a Mux outage and does not time out fresh processing", async () => {
  await env.DB.exec("UPDATE videos SET deleted_at = NULL; UPDATE revisions SET state = 'processing';");
  const lookup = vi.spyOn(fakeMux, "getAsset").mockRejectedValueOnce(new Error("outage"));
  await tick();
  expect(await rows("revisions")).toMatchObject([{ state: "processing" }]);
  await env.DB.prepare("UPDATE revisions SET created_at = ?").bind(Date.now()).run();
  lookup.mockResolvedValue({ id: "a", status: "preparing" });
  await tick();
  expect(await rows("revisions")).toMatchObject([{ state: "processing" }]);
});

it("cleans up an asset reported after the Revision timed out without reviving it", async () => {
  await env.DB.exec("UPDATE videos SET deleted_at = NULL; UPDATE revisions SET state = 'uploading', mux_asset_id = NULL;");
  await tick();
  const body = JSON.stringify({ type: "video.asset.ready", data: {
    id: "late", passthrough: "r", duration: 30, playback_ids: [{ id: "pb", policy: "signed" }],
  } });
  expect((await postWebhook(body, fakeSignature(body))).status).toBe(200);
  expect(await rows("revisions")).toMatchObject([{ state: "errored", mux_asset_id: "late" }]);
  const remove = vi.spyOn(fakeMux, "deleteAsset");
  await tick();
  expect(remove).toHaveBeenCalledWith("late");
  expect(await rows("revisions")).toMatchObject([{ state: "errored", mux_asset_id: null }]);
});
