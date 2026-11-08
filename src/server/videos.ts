import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import { requireMember } from "@/server/access";
import { getDb, type Db } from "@/server/db";
import {
  projects,
  revisions,
  videos,
  videoStatuses,
  type VideoStatus,
} from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

const MAX_TITLE_LENGTH = 120;

function reject(
  status: 400 | 404 | 409 | 502,
  code:
    | "invalid-title"
    | "invalid-status"
    | "not-found"
    | "already-sent"
    | "upload-unavailable",
): never {
  throw Response.json({ code }, { status });
}

// Input is checked in the handlers, not an input validator, so Access always runs first.
const field = (data: unknown, name: string) =>
  (data as Record<string, unknown> | undefined)?.[name];

const textField = (data: unknown, name: string) => {
  const raw = field(data, name);
  return typeof raw === "string" ? raw : "";
};

function parseTitle(data: unknown) {
  const title = textField(data, "title").trim();
  if (!title || title.length > MAX_TITLE_LENGTH) reject(400, "invalid-title");
  return title;
}

/** The Video can still change: it and its Project are live, and the Project is not Complete. */
const videoIsWritable = (db: Db, videoId: string) =>
  and(
    eq(videos.id, videoId),
    isNull(videos.deletedAt),
    exists(
      db
        .select({ one: sql`1` })
        .from(projects)
        .where(
          and(
            eq(projects.id, videos.projectId),
            isNull(projects.deletedAt),
            isNull(projects.completedAt),
          ),
        ),
    ),
  );

/** Removes a Revision that never reached Mux, and a Video that held nothing else. */
function discardRevision(db: Db, revisionId: string, videoId: string) {
  return db.batch([
    db
      .delete(revisions)
      .where(and(eq(revisions.id, revisionId), eq(revisions.state, "uploading"))),
    db
      .delete(videos)
      .where(
        and(
          eq(videos.id, videoId),
          notExists(
            db
              .select({ one: sql`1` })
              .from(revisions)
              .where(eq(revisions.videoId, videoId)),
          ),
        ),
      ),
  ]);
}

/**
 * One statement per row, conditional on the Project being open, so a Complete
 * or deleted Project creates nothing. `MAX + 1` is safe because D1 runs each
 * statement alone.
 */
async function insertRevision(
  db: Db,
  input: {
    revisionId: string;
    videoId: string;
    memberId: string;
    now: number;
    newVideo?: { projectId: string; title: string };
  },
) {
  const { revisionId, videoId, memberId, now, newVideo } = input;
  const insertRow = db
    .insert(revisions)
    .select(
      sql`SELECT ${revisionId}, ${videoId},
            COALESCE((SELECT MAX(number) FROM revisions WHERE video_id = ${videoId}), 0) + 1,
            'uploading', ${memberId}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ${now}, NULL
          FROM videos
          JOIN projects ON projects.id = videos.project_id
          WHERE videos.id = ${videoId}
            AND videos.deleted_at IS NULL
            AND projects.deleted_at IS NULL
            AND projects.completed_at IS NULL`,
    )
    .returning({ id: revisions.id });

  if (newVideo) {
    const [, inserted] = await db.batch([
      db
        .insert(videos)
        .select(
          sql`SELECT ${videoId}, id, ${newVideo.title}, 'review', ${memberId}, ${now}, ${now}, NULL
              FROM projects
              WHERE id = ${newVideo.projectId}
                AND deleted_at IS NULL
                AND completed_at IS NULL`,
        ),
      insertRow,
    ]);
    return inserted.length === 1;
  }

  const [inserted] = await db.batch([
    insertRow,
    db.update(videos).set({ updatedAt: now }).where(eq(videos.id, videoId)),
  ]);
  return inserted.length === 1;
}

export const startUpload = createServerFn({ method: "POST" })
  .validator(
    (data: { projectId: string; title: string } | { videoId: string }) => data,
  )
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const existingVideoId = textField(data, "videoId");
    const newVideo = existingVideoId
      ? undefined
      : { projectId: textField(data, "projectId"), title: parseTitle(data) };

    const db = getDb();
    const revisionId = crypto.randomUUID();
    const videoId = existingVideoId || crypto.randomUUID();
    const created = await insertRevision(db, {
      revisionId,
      videoId,
      memberId: member.id,
      now: Date.now(),
      newVideo,
    });
    if (!created) reject(404, "not-found");

    let upload: { uploadId: string; url: string };
    try {
      upload = await getMuxGateway().createDirectUpload({
        corsOrigin: env.APP_ORIGIN,
        passthrough: revisionId,
      });
    } catch {
      await discardRevision(db, revisionId, videoId);
      reject(502, "upload-unavailable");
    }

    await db
      .update(revisions)
      .set({ muxUploadId: upload.uploadId })
      .where(eq(revisions.id, revisionId));
    return { videoId, revisionId, uploadUrl: upload.url };
  });

export const cancelUpload = createServerFn({ method: "POST" })
  .validator((data: { revisionId: string }) => data)
  .handler(async ({ data }) => {
    await requireMember("editor");
    const db = getDb();
    const [revision] = await db
      .select({
        videoId: revisions.videoId,
        state: revisions.state,
        muxUploadId: revisions.muxUploadId,
      })
      .from(revisions)
      .where(eq(revisions.id, textField(data, "revisionId")));

    // Already gone is what the caller wanted.
    if (!revision) return { cancelled: true };
    if (revision.state !== "uploading") reject(409, "already-sent");

    const cancelled =
      revision.muxUploadId === null ||
      (await getMuxGateway().cancelDirectUpload(revision.muxUploadId));
    if (!cancelled) reject(409, "already-sent");

    await discardRevision(db, textField(data, "revisionId"), revision.videoId);
    return { cancelled: true };
  });

async function updateVideo(
  videoId: string,
  changes: { title: string } | { status: VideoStatus },
) {
  const db = getDb();
  const [video] = await db
    .update(videos)
    .set({ ...changes, updatedAt: Date.now() })
    .where(videoIsWritable(db, videoId))
    .returning({
      id: videos.id,
      title: videos.title,
      status: videos.status,
    });
  if (!video) reject(404, "not-found");
  return video;
}

export const renameVideo = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; title: string }) => data)
  .handler(async ({ data }) => {
    await requireMember("editor");
    return updateVideo(textField(data, "videoId"), { title: parseTitle(data) });
  });

export const setVideoStatus = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; status: VideoStatus }) => data)
  .handler(async ({ data }) => {
    await requireMember("editor");
    const status = field(data, "status") as VideoStatus;
    if (!videoStatuses.includes(status)) reject(400, "invalid-status");
    return updateVideo(textField(data, "videoId"), { status });
  });
