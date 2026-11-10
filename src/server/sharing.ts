import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  activeMember,
  id,
  readAsMember,
  readShareLink,
  refuse,
  requireMember,
  text,
  writableVideo,
} from "@/server/access";
import { validDrawing, type Shape } from "@/lib/drawing";
import { bodyOf, commentColumns, toComment } from "@/server/comment-rules";
import { getDb } from "@/server/db";
import { comments, shareLinks, sharePermissions, type SharePermission } from "@/server/db/schema";
import { getMuxGateway } from "@/server/mux";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Bytes of 248 and above are rejected, because 248 is the largest multiple of 62 in a byte. */
function newShareToken() {
  let token = "";
  while (token.length < 32) {
    for (const byte of crypto.getRandomValues(new Uint8Array(48))) {
      if (byte < 248 && token.length < 32) token += alphabet[byte % 62];
    }
  }
  return token;
}

const linkFields = {
  id: shareLinks.id,
  name: shareLinks.name,
  token: shareLinks.token,
  permission: shareLinks.permission,
  createdAt: shareLinks.createdAt,
};

export const createShareLink = createServerFn({ method: "POST" })
  .validator((data: { videoId: string; name: string; permission: SharePermission }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const name = text(data, "name", 60);
    const videoId = id(data, "videoId");
    if (!sharePermissions.includes(data?.permission)) refuse(400, "invalid-request");
    const [created] = await getDb()
      .insert(shareLinks)
      .select(sql`
      SELECT ${crypto.randomUUID()}, ${videoId}, ${name}, ${newShareToken()}, ${data.permission}, ${member.id}, ${Date.now()}, NULL
      WHERE ${writableVideo(videoId)} AND ${activeMember(member.id, "editor")}
    `)
      .returning(linkFields);
    if (!created) refuse(404, "not-found");
    return created;
  });

export const listShareLinks = createServerFn({ method: "POST" })
  .validator((data: { videoId: string }) => data)
  .handler(async ({ data }) => {
    const videoId = typeof data?.videoId === "string" ? data.videoId : "";
    const {
      results: [links],
    } = await readAsMember("editor", (db) => [
      db
        .select(linkFields)
        .from(shareLinks)
        .where(and(eq(shareLinks.videoId, videoId), isNull(shareLinks.revokedAt)))
        .orderBy(desc(shareLinks.createdAt)),
    ]);
    return { links };
  });

export const revokeShareLink = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    const [written] = await getDb()
      .update(shareLinks)
      .set({ revokedAt: Date.now() })
      .where(
        and(
          eq(shareLinks.id, id(data, "id")),
          isNull(shareLinks.revokedAt),
          activeMember(member.id, "editor"),
        ),
      )
      .returning({ id: shareLinks.id });
    if (!written) refuse(404, "not-found");
    return written;
  });

/** toComment drops IDs: a Guest must never receive a Clerk or Member ID. */
export const getGuestReview = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const link = await readShareLink(data?.token);
    const [rows, playback] = await Promise.all([
      getDb()
        .select(commentColumns)
        .from(comments)
        .where(eq(comments.revisionId, link.revisionId))
        .orderBy(asc(comments.timecodeMs), asc(comments.createdAt), asc(comments.id)),
      getMuxGateway().createPlayback({
        playbackId: link.playbackId,
        durationSeconds: link.durationMs / 1000,
      }),
    ]);
    return {
      title: link.title,
      permission: link.permission,
      revision: {
        id: link.revisionId,
        number: link.number,
        frameRate: link.frameRate,
        durationMs: link.durationMs,
      },
      playback,
      comments: rows.map((row) => toComment(row)),
    };
  });

export const createGuestComment = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      id: string;
      name: string;
      body: string;
      timecodeMs: number;
      drawing?: Shape[] | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const link = await readShareLink(data?.token);
    if (link.permission !== "comment") refuse(403, "insufficient-role");
    if (!(await env.SHARE_LINK_COMMENT_LIMIT.limit({ key: link.id })).success)
      refuse(429, "rate-limited");
    const commentId = id(data, "id");
    const name = text(data, "name", 60);
    const drawing = data.drawing ?? null;
    if (drawing !== null && !validDrawing(drawing)) refuse(400, "invalid-request");
    const body = bodyOf(data.body, drawing !== null);
    if (
      !Number.isInteger(data.timecodeMs) ||
      data.timecodeMs < 0 ||
      data.timecodeMs > link.durationMs
    )
      refuse(400, "invalid-request");
    const db = getDb();
    // Repeats the link check inside the write, so a revoke landing after the read still wins.
    const [inserted, existing] = await db.batch([
      db
        .insert(comments)
        .select(sql`SELECT ${commentId}, ${link.revisionId}, NULL, s.id, ${name}, ${data.timecodeMs}, ${body}, ${drawing && JSON.stringify(drawing)}, NULL, NULL, ${Date.now()}, NULL
        FROM share_links s
        WHERE s.id = ${link.id} AND s.revoked_at IS NULL AND s.permission = 'comment'
          AND ${writableVideo(sql`s.video_id`)}`)
        .onConflictDoNothing()
        .returning({ id: comments.id }),
      db
        .select({ shareLinkId: comments.shareLinkId })
        .from(comments)
        .where(eq(comments.id, commentId)),
    ]);
    if (!inserted.length && existing[0]?.shareLinkId !== link.id) refuse(404, "not-found");
    return { id: commentId };
  });
