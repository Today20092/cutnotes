import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeSignature } from "./support/fake-mux";
import {
  clearDatabase,
  seedMember,
  seedProject,
  seedRevision,
  seedVideo,
  type RevisionSeed,
} from "./support/seed";
import { postWebhook } from "./support/worker";

const deliver = (event: unknown) => {
  const rawBody = JSON.stringify(event);
  return postWebhook(rawBody, fakeSignature(rawBody));
};

type Row = {
  state: string;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  duration_ms: number | null;
  frame_rate: number | null;
  aspect_ratio: string | null;
  error_code: string | null;
  ready_at: number | null;
};

const revision = async (id = "r1") =>
  (await env.DB.prepare("SELECT * FROM revisions WHERE id = ?").bind(id).first<Row>()) as Row;

const videoUpdatedAt = async () =>
  (
    await env.DB.prepare("SELECT updated_at FROM videos WHERE id = 'v1'").first<{
      updated_at: number;
    }>()
  )?.updated_at;

async function seed(overrides: Partial<RevisionSeed> = {}) {
  await seedMember("owner");
  await seedProject("p1");
  await seedVideo("v1", "p1");
  await seedRevision({ id: "r1", videoId: "v1", uploadId: "u1", ...overrides });
}

const uploadEvent = (type: string, data: Record<string, unknown> = {}) => ({
  type: `video.upload.${type}`,
  data: {
    id: "u1",
    new_asset_settings: { passthrough: "r1" },
    ...data,
  },
});

const assetEvent = (type: string, data: Record<string, unknown> = {}) => ({
  type: `video.asset.${type}`,
  data: { id: "a1", upload_id: "u1", passthrough: "r1", ...data },
});

const uploadAssetCreated = uploadEvent("asset_created", { asset_id: "a1" });
const assetCreated = assetEvent("created");
const assetReady = assetEvent("ready", {
  duration: 62.5,
  aspect_ratio: "16:9",
  playback_ids: [
    { id: "public-never", policy: "public" },
    { id: "pb1", policy: "signed" },
  ],
  tracks: [{ type: "audio" }, { type: "video", max_frame_rate: 23.976 }],
});
const assetErrored = assetEvent("errored", {
  errors: { type: "invalid_input", messages: ["bad file"] },
});

beforeEach(clearDatabase);

describe("signature", () => {
  it("refuses a bad signature without changing anything", async () => {
    await seed();

    const response = await postWebhook(JSON.stringify(uploadAssetCreated), "fake-wrong");

    expect(response.status).toBe(401);
    expect((await revision()).state).toBe("uploading");
  });

  it("refuses a missing signature", async () => {
    const response = await postWebhook(JSON.stringify(assetReady), null);

    expect(response.status).toBe(401);
  });

  it("checks the signature before parsing the body", async () => {
    const response = await postWebhook("{not json", "fake-wrong");

    expect(response.status).toBe(401);
  });

  it("verifies the exact bytes received", async () => {
    await seed();
    const rawBody = `  ${JSON.stringify(uploadAssetCreated)}\n`;

    const response = await postWebhook(rawBody, fakeSignature(rawBody));

    expect(response.status).toBe(200);
    expect((await revision()).state).toBe("processing");
  });

  it("answers a signed body that is not JSON as bad, and changes nothing", async () => {
    const response = await postWebhook("{not json", fakeSignature("{not json"));

    expect(response.status).toBe(400);
  });
});

describe("Revision lifecycle", () => {
  it("moves to processing when the upload becomes an asset", async () => {
    await seed();

    expect((await deliver(uploadAssetCreated)).status).toBe(200);

    expect(await revision()).toMatchObject({
      state: "processing",
      mux_asset_id: "a1",
    });
  });

  it("moves to processing on video.asset.created", async () => {
    await seed();

    await deliver(assetCreated);

    expect(await revision()).toMatchObject({
      state: "processing",
      mux_asset_id: "a1",
    });
  });

  it("becomes ready with the asset's details and only its signed playback ID", async () => {
    await seed({ state: "processing", assetId: "a1" });

    await deliver(assetReady);

    const row = await revision();
    expect(row).toMatchObject({
      state: "ready",
      mux_playback_id: "pb1",
      duration_ms: 62_500,
      frame_rate: 23.976,
      aspect_ratio: "16:9",
    });
    expect(row.ready_at).toEqual(expect.any(Number));
  });

  it("updates the Video's last update when a Revision becomes ready", async () => {
    await seed({ state: "processing" });

    await deliver(assetReady);

    expect(await videoUpdatedAt()).toBeGreaterThan(1);
  });

  it("fails a Revision with no signed playback ID rather than exposing it", async () => {
    await seed({ state: "processing" });

    await deliver(
      assetEvent("ready", {
        duration: 10,
        playback_ids: [{ id: "public-never", policy: "public" }],
      }),
    );

    expect(await revision()).toMatchObject({
      state: "errored",
      mux_playback_id: null,
      error_code: "no-signed-playback",
    });
  });

  it("fails a Revision over 12 hours when it reaches ready", async () => {
    await seed({ state: "processing" });

    await deliver(
      assetEvent("ready", {
        duration: 43_200.5,
        playback_ids: [{ id: "pb1", policy: "signed" }],
      }),
    );

    expect(await revision()).toMatchObject({
      state: "errored",
      mux_playback_id: null,
      error_code: "too-long",
    });
  });

  it("accepts exactly 12 hours", async () => {
    await seed({ state: "processing" });

    await deliver(
      assetEvent("ready", {
        duration: 43_200,
        playback_ids: [{ id: "pb1", policy: "signed" }],
      }),
    );

    expect((await revision()).state).toBe("ready");
  });

  it("records why processing failed", async () => {
    await seed({ state: "processing" });

    await deliver(assetErrored);

    expect(await revision()).toMatchObject({
      state: "errored",
      error_code: "invalid_input",
    });
  });

  it.each([
    ["cancelled", "upload-cancelled"],
    ["errored", "upload-errored"],
  ])("fails an upload that was %s at Mux", async (type, code) => {
    await seed();

    await deliver(uploadEvent(type));

    expect(await revision()).toMatchObject({
      state: "errored",
      error_code: code,
    });
  });

  it("answers an event it does not handle and changes nothing", async () => {
    await seed();

    const response = await deliver(assetEvent("static_renditions.ready"));

    expect(response.status).toBe(200);
    expect((await revision()).state).toBe("uploading");
  });
});

describe("duplicate and out-of-order delivery", () => {
  it.each([
    ["video.upload.asset_created", uploadAssetCreated],
    ["video.asset.created", assetCreated],
    ["video.upload.cancelled", uploadEvent("cancelled")],
    ["video.upload.errored", uploadEvent("errored")],
    ["video.asset.errored", assetErrored],
  ])("a late %s never moves a ready Revision", async (_label, event) => {
    await seed({ state: "processing" });
    await deliver(assetReady);
    const ready = await revision();

    expect((await deliver(event)).status).toBe(200);

    expect(await revision()).toEqual(ready);
  });

  it("a repeated ready changes nothing", async () => {
    await seed({ state: "processing" });
    await deliver(assetReady);
    const ready = await revision();

    await deliver(assetReady);

    expect(await revision()).toEqual(ready);
  });

  it.each([
    ["video.upload.asset_created", uploadAssetCreated],
    ["video.asset.created", assetCreated],
    ["video.asset.ready", assetReady],
  ])("a late %s never revives a failed Revision", async (_label, event) => {
    await seed({ state: "processing" });
    await deliver(assetErrored);

    await deliver(event);

    expect(await revision()).toMatchObject({
      state: "errored",
      mux_playback_id: null,
      error_code: "invalid_input",
    });
  });

  it("reaches ready when ready arrives first, and stays there", async () => {
    await seed();

    await deliver(assetReady);
    await deliver(assetCreated);
    await deliver(uploadAssetCreated);

    expect(await revision()).toMatchObject({
      state: "ready",
      mux_asset_id: "a1",
      mux_playback_id: "pb1",
    });
  });

  it("does not let a late cancel undo processing", async () => {
    await seed();
    await deliver(uploadAssetCreated);

    await deliver(uploadEvent("cancelled"));

    expect((await revision()).state).toBe("processing");
  });

  it("keeps the asset ID of a failed Revision so it can be cleaned up", async () => {
    await seed();
    await deliver(uploadEvent("errored"));

    await deliver(uploadAssetCreated);

    expect(await revision()).toMatchObject({
      state: "errored",
      mux_asset_id: "a1",
    });
  });
});

describe("finding the Revision", () => {
  const anotherRevision = () =>
    seedRevision({
      id: "r2",
      videoId: "v1",
      number: 2,
      uploadId: "u2",
      assetId: "a2",
    });

  it("prefers the upload ID over the asset ID and passthrough", async () => {
    await seed();
    await anotherRevision();

    await deliver(assetEvent("created", { id: "a2", upload_id: "u1", passthrough: "r2" }));

    expect((await revision("r1")).state).toBe("processing");
    expect((await revision("r2")).state).toBe("uploading");
  });

  it("falls back to the asset ID", async () => {
    await seed({ assetId: "a1" });
    await anotherRevision();

    await deliver(assetEvent("created", { upload_id: undefined, passthrough: "r2" }));

    expect((await revision("r1")).state).toBe("processing");
    expect((await revision("r2")).state).toBe("uploading");
  });

  it("falls back to passthrough", async () => {
    await seed({ uploadId: null });

    await deliver(assetEvent("created", { upload_id: "unknown" }));

    expect((await revision()).state).toBe("processing");
  });

  it("ignores an event whose passthrough matches no Revision", async () => {
    await seed();

    const response = await deliver(
      assetEvent("ready", {
        id: "other",
        upload_id: "other",
        passthrough: "not-a-revision",
        duration: 10,
        playback_ids: [{ id: "pb1", policy: "signed" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(await revision()).toMatchObject({
      state: "uploading",
      mux_playback_id: null,
    });
  });

  it("ignores an event with no identifiers at all", async () => {
    const response = await deliver({ type: "video.asset.ready" });

    expect(response.status).toBe(200);
  });
});
