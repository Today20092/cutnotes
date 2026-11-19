import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  activeMember,
  latestReadyRevision,
  parse,
  projectAccess,
  uploadAccess,
  videoAccess,
  id,
  openProject,
  refuse,
  requireMember,
  text,
  writableVideo,
} from "@/server/access";
import { getDb, type Db } from "@/server/db";
import { members, revisions, videos, type VideoStatus } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";
import { moveStage } from "@/server/project-stage";
import { discardRevision } from "@/server/revision-lifecycle";

const MAX_TITLE_LENGTH = 120;

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
          WHERE ${writableVideo(videoId)} AND ${uploadAccess(memberId, videoId)}`,
    )
    .returning({ id: revisions.id });

  if (newVideo) {
    const [, inserted] = await db.batch([
      db.insert(videos).select(
        sql`SELECT ${videoId}, ${newVideo.projectId}, ${newVideo.title}, 'review', ${memberId}, ${now}, ${now}, NULL
              WHERE ${openProject(newVideo.projectId)} AND ${projectAccess(memberId, newVideo.projectId, "uploader")}`,
      ),
      insertRow,
    ]);
    return inserted.length === 1;
  }

  const [inserted] = await db.batch([
    insertRow,
    db
      .update(videos)
      .set({ updatedAt: now })
      .where(
        and(
          eq(videos.id, videoId),
          writableVideo(videoId),
          uploadAccess(memberId, videoId),
          sql`EXISTS (SELECT 1 FROM revisions WHERE id = ${revisionId})`,
        ),
      ),
  ]);
  return inserted.length === 1;
}

export const startUpload = createServerFn({ method: "POST" })
  .validator((data: { projectId: string; title: string } | { videoId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    const existingVideoId = "videoId" in Object(data) ? id(data, "videoId") : undefined;
    const newVideo = existingVideoId
      ? undefined
      : {
          projectId: id(data, "projectId"),
          title: text(data, "title", MAX_TITLE_LENGTH, "invalid-title"),
        };

    const db = getDb();
    const revisionId = crypto.randomUUID();
    const videoId = existingVideoId ?? crypto.randomUUID();
    const created = await insertRevision(db, {
      revisionId,
      videoId,
      memberId: member.id,
      now: Date.now(),
      newVideo,
    });
    if (!created) refuse(404, "not-found");

    let upload: { uploadId: string; url: string };
    try {
      upload = await getMuxGateway().createDirectUpload({
        corsOrigin: env.APP_ORIGIN,
        passthrough: revisionId,
      });
    } catch {
      await discardRevision(db, revisionId, videoId);
      refuse(502, "upload-unavailable");
    }

    const [, eligible] = await db.batch([
      // Keep the Mux ID even if Access changed, so cleanup never loses the upload.
      db
        .update(revisions)
        .set({ muxUploadId: upload.uploadId })
        .where(eq(revisions.id, revisionId)),
      db
        .select({ id: revisions.id })
        .from(revisions)
        .where(
          and(
            eq(revisions.id, revisionId),
            eq(revisions.state, "uploading"),
            eq(revisions.videoId, videoId),
            writableVideo(videoId),
            uploadAccess(member.id, videoId),
          ),
        ),
    ]);
    if (!eligible.length) {
      if (await getMuxGateway().cancelDirectUpload(upload.uploadId))
        await discardRevision(db, revisionId, videoId);
      refuse(404, "not-found");
    }
    return { videoId, revisionId, uploadUrl: upload.url };
  });

export const cancelUpload = createServerFn({ method: "POST" })
  .validator((data: { revisionId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    const db = getDb();
    const revisionId = id(data, "revisionId");
    const videoId = sql`(SELECT video_id FROM revisions WHERE id = ${revisionId})`;
    const [rows, acting] = await db.batch([
      db
        .select({
          videoId: revisions.videoId,
          state: revisions.state,
          muxUploadId: revisions.muxUploadId,
        })
        .from(revisions)
        .where(and(eq(revisions.id, revisionId), uploadAccess(member.id, videoId))),
      db
        .select({ id: members.id })
        .from(members)
        .where(
          and(
            eq(members.id, member.id),
            activeMember(member.id, "viewer"),
            or(
              uploadAccess(member.id, videoId),
              sql`NOT EXISTS (SELECT 1 FROM revisions WHERE id = ${revisionId})`,
            ),
          ),
        ),
    ]);
    if (!acting.length) refuse(404, "not-found");
    const [revision] = rows;

    // Already gone is what the caller wanted.
    if (!revision) return { cancelled: true };
    if (revision.state !== "uploading") refuse(409, "already-sent");

    // Creation has not returned yet: do not delete the row that will hold its Mux ID.
    if (revision.muxUploadId === null) refuse(409, "already-sent");
    const cancelled = await getMuxGateway().cancelDirectUpload(revision.muxUploadId);
    if (!cancelled) refuse(409, "already-sent");

    const [discarded] = await discardRevision(
      db,
      id(data, "revisionId"),
      revision.videoId,
      member.id,
    );
    if (!discarded.meta.changes) refuse(404, "not-found");
    return { cancelled: true };
  });

export const renameVideo = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; title: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    const videoId = id(data, "videoId");
    const [video] = await getDb()
      .update(videos)
      .set({ title: text(data, "title", MAX_TITLE_LENGTH, "invalid-title"), updatedAt: Date.now() })
      .where(
        and(
          eq(videos.id, videoId),
          writableVideo(videoId),
          videoAccess(member.id, videoId, "editor"),
        ),
      )
      .returning({ id: videos.id, title: videos.title, status: videos.status });
    if (!video) refuse(404, "not-found");
    return video;
  });

const idField = v.pipe(v.string(), v.nonEmpty(), v.maxLength(128));
const decisionSchema = v.object({ videoId: idField, revisionId: idField });
export type DecisionInput = v.InferInput<typeof decisionSchema>;

/**
 * A review decision by an Owner or the Project's Editor on the Revision they watched: the
 * Video's Status, then its Project's Stage, in one batch that re-checks Access and that the
 * Revision is still the newest ready cut in each statement.
 */
async function decide(memberId: string, raw: DecisionInput, status: VideoStatus) {
  const { videoId, revisionId } = parse(decisionSchema, raw);
  const db = getDb();
  const now = Date.now();
  const projectId = sql`(SELECT project_id FROM videos WHERE id = ${videoId})`;
  const editor = videoAccess(memberId, videoId, "editor");
  const allowed = and(editor, latestReadyRevision(revisionId, videoId));
  const [decided] = await db.batch([
    db
      .update(videos)
      .set({ status, updatedAt: now })
      .where(and(eq(videos.id, videoId), writableVideo(videoId), allowed))
      .returning({ id: videos.id, title: videos.title, status: videos.status }),
    status === "rework"
      ? moveStage(db, projectId, "editing", allowed, now)
      : // Done only once every live Video in the Project is done.
        moveStage(
          db,
          projectId,
          "done",
          and(
            allowed,
            sql`NOT EXISTS (SELECT 1 FROM videos AS other WHERE other.project_id = ${projectId}
              AND other.deleted_at IS NULL AND other.status <> 'done')`,
          ),
          now,
        ),
  ]);
  const [video] = decided;
  if (video) return video;
  // Only someone who may decide learns that a newer cut is ready.
  const [decider] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.id, videoId), writableVideo(videoId), editor));
  if (decider) refuse(409, "not-latest-revision");
  refuse(404, "not-found");
}

export const requestChanges = createServerFn({ method: "POST" })
  .validator((data: DecisionInput) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    return decide(member.id, data, "rework");
  });

export const approveVideo = createServerFn({ method: "POST" })
  .validator((data: DecisionInput) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    return decide(member.id, data, "done");
  });

export const deleteVideo = createServerFn({ method: "POST" })
  .validator((data: { videoId: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    const db = getDb();
    const [video] = await db
      .update(videos)
      .set({ deletedAt: Date.now() })
      .where(
        and(
          eq(videos.id, id(data, "videoId")),
          isNull(videos.deletedAt),
          sql`EXISTS (SELECT 1 FROM projects WHERE id = ${videos.projectId} AND deleted_at IS NULL)`,
          or(
            activeMember(member.id, "owner"),
            // Editors and Uploaders delete only Videos they created.
            and(videoAccess(member.id, videos.id, "uploader"), eq(videos.createdBy, member.id)),
          ),
        ),
      )
      .returning({ id: videos.id });
    if (!video) refuse(404, "not-found");
    return video;
  });
