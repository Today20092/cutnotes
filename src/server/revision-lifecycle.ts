import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { revisions, videos } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

const MAX_DURATION_SECONDS = 12 * 60 * 60;

type MuxEvent = {
  type?: string;
  data?: {
    id?: string;
    asset_id?: string;
    upload_id?: string;
    passthrough?: string;
    new_asset_settings?: { passthrough?: string };
    duration?: number;
    aspect_ratio?: string;
    playback_ids?: { id: string; policy: string }[];
    tracks?: { type: string; max_frame_rate?: number }[];
    errors?: { type?: string };
  };
};

type Identifiers = {
  uploadId?: string;
  assetId?: string;
  passthrough?: string;
};

function identifiersOf(event: MuxEvent): Identifiers {
  const data = event.data ?? {};
  return event.type?.startsWith("video.upload.")
    ? {
        uploadId: data.id,
        assetId: data.asset_id,
        passthrough: data.new_asset_settings?.passthrough,
      }
    : { uploadId: data.upload_id, assetId: data.id, passthrough: data.passthrough };
}

/** Lookup order is upload ID, then asset ID, then `passthrough`. */
async function findRevisionId({ uploadId, assetId, passthrough }: Identifiers) {
  const matchers = [
    uploadId ? eq(revisions.muxUploadId, uploadId) : undefined,
    assetId ? eq(revisions.muxAssetId, assetId) : undefined,
    passthrough ? eq(revisions.id, passthrough) : undefined,
  ].filter((matcher) => matcher !== undefined);
  if (matchers.length === 0) return undefined;

  const rows = await getDb()
    .select({
      id: revisions.id,
      uploadId: revisions.muxUploadId,
      assetId: revisions.muxAssetId,
    })
    .from(revisions)
    .where(or(...matchers));

  return (
    (uploadId && rows.find((row) => row.uploadId === uploadId)?.id) ||
    (assetId && rows.find((row) => row.assetId === assetId)?.id) ||
    rows.find((row) => row.id === passthrough)?.id
  );
}

const isUnfinished = inArray(revisions.state, ["uploading", "processing"]);

/** Records the asset even on a failed Revision, so its Mux asset can be deleted later. */
function markProcessing(revisionId: string, assetId: string | undefined) {
  return getDb()
    .update(revisions)
    .set({
      muxAssetId: sql`COALESCE(${revisions.muxAssetId}, ${assetId ?? null})`,
      state: sql`CASE WHEN ${revisions.state} = 'uploading' THEN 'processing' ELSE ${revisions.state} END`,
    })
    .where(eq(revisions.id, revisionId));
}

function markErrored(
  revisionId: string,
  errorCode: string,
  assetId: string | undefined,
) {
  return getDb()
    .update(revisions)
    .set({
      state: "errored",
      errorCode,
      muxAssetId: sql`COALESCE(${revisions.muxAssetId}, ${assetId ?? null})`,
    })
    .where(and(eq(revisions.id, revisionId), isUnfinished));
}

async function markReady(revisionId: string, event: MuxEvent) {
  const data = event.data ?? {};
  const assetId = data.id;
  const duration = data.duration ?? 0;
  if (duration > MAX_DURATION_SECONDS) {
    return markErrored(revisionId, "too-long", assetId);
  }
  const playbackId = data.playback_ids?.find(
    (playback) => playback.policy === "signed",
  )?.id;
  if (!playbackId) return markErrored(revisionId, "no-signed-playback", assetId);

  const now = Date.now();
  const db = getDb();
  const ready = await db
    .update(revisions)
    .set({
      state: "ready",
      muxAssetId: sql`COALESCE(${revisions.muxAssetId}, ${assetId ?? null})`,
      muxPlaybackId: playbackId,
      durationMs: Math.round(duration * 1000),
      frameRate:
        data.tracks?.find((track) => track.type === "video")?.max_frame_rate ??
        null,
      aspectRatio: data.aspect_ratio ?? null,
      readyAt: now,
    })
    .where(and(eq(revisions.id, revisionId), isUnfinished))
    .returning({ videoId: revisions.videoId });

  if (ready[0]) {
    await db
      .update(videos)
      .set({ updatedAt: now })
      .where(eq(videos.id, ready[0].videoId));
  }
}

/** The sweep shares the webhook's conditional, monotonic transitions. */
export async function reconcileRevision(revision: typeof revisions.$inferSelect, now: number) {
  const mux = getMuxGateway();
  let assetId = revision.muxAssetId;
  if (!assetId && revision.muxUploadId) {
    const upload = await mux.getDirectUpload(revision.muxUploadId);
    assetId = upload?.asset_id ?? null;
    if (assetId) await markProcessing(revision.id, assetId);
    else if (!upload || ["cancelled", "errored", "timed_out"].includes(upload.status)) {
      await markUploadFailed(revision.id, "upload-failed");
      return;
    }
  }
  if (assetId) {
    const asset = await mux.getAsset(assetId);
    if (asset?.status === "ready") {
      await markReady(revision.id, { data: asset });
      return;
    }
    if (!asset || asset.status === "errored") {
      await markErrored(revision.id, asset?.errors?.type ?? "processing-failed", assetId);
      return;
    }
  }
  // Direct uploads expire after 24 hours; allow the same window for processing.
  if (revision.createdAt <= now - 24 * 60 * 60 * 1000) {
    if (!assetId && revision.muxUploadId) {
      if (!(await mux.cancelDirectUpload(revision.muxUploadId))) return;
    }
    await markErrored(revision.id, "timed-out", assetId ?? undefined);
  }
}

async function applyEvent(event: MuxEvent) {
  const identifiers = identifiersOf(event);
  const handled = [
    "video.upload.asset_created",
    "video.upload.cancelled",
    "video.upload.errored",
    "video.asset.created",
    "video.asset.ready",
    "video.asset.errored",
  ];
  if (!handled.includes(event.type ?? "")) return;

  const revisionId = await findRevisionId(identifiers);
  if (!revisionId) return;

  // Even a late ready/error event must leave its asset discoverable for cleanup.
  if (identifiers.assetId) await markProcessing(revisionId, identifiers.assetId);

  switch (event.type) {
    case "video.upload.asset_created":
    case "video.asset.created":
      break;
    case "video.upload.cancelled":
      await markUploadFailed(revisionId, "upload-cancelled");
      break;
    case "video.upload.errored":
      await markUploadFailed(revisionId, "upload-errored");
      break;
    case "video.asset.ready":
      await markReady(revisionId, event);
      break;
    case "video.asset.errored":
      await markErrored(
        revisionId,
        event.data?.errors?.type ?? "processing-failed",
        identifiers.assetId,
      );
      break;
  }
}

/** An upload can only fail before it has become an asset. */
function markUploadFailed(revisionId: string, errorCode: string) {
  return getDb()
    .update(revisions)
    .set({ state: "errored", errorCode })
    .where(and(eq(revisions.id, revisionId), eq(revisions.state, "uploading")));
}

/** Verifies against the raw body before anything parses it. */
export async function handleMuxWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const verified = await getMuxGateway().verifyWebhookSignature({
    rawBody,
    signature: request.headers.get("mux-signature"),
  });
  if (!verified) return new Response(null, { status: 401 });

  let event: MuxEvent;
  try {
    event = JSON.parse(rawBody) as MuxEvent;
  } catch {
    return new Response(null, { status: 400 });
  }

  await applyEvent(event);
  return new Response(null, { status: 200 });
}
