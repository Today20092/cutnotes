import { createServerFn } from "@tanstack/react-start";
import { and, eq, or, sql } from "drizzle-orm";
import { activeMember, id, readyRevision, refuse, requireMember } from "@/server/access";
import { bodyOf } from "@/server/comment-rules";
import { getDb } from "@/server/db";
import { comments, type Member } from "@/server/db/schema";
import { validDrawing, type Shape } from "@/lib/drawing";

export type CommentTarget = { videoId: string; revisionId: string; id: string };
export type NewComment = CommentTarget & {
  body: string;
  timecodeMs: number;
  drawing?: Shape[] | null;
};

const validTarget = (data: CommentTarget) => {
  for (const field of ["id", "videoId", "revisionId"]) id(data, field);
};

const targetComment = (data: CommentTarget, member: Member) =>
  and(
    eq(comments.id, data.id),
    eq(comments.revisionId, data.revisionId),
    readyRevision(data.revisionId, data.videoId),
    activeMember(member.id, "viewer"),
  );

export const createComment = createServerFn({ method: "POST" })
  .validator((data: NewComment) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    validTarget(data);
    if (data.drawing != null && !validDrawing(data.drawing)) refuse(400, "invalid-request");
    const drawing = data.drawing == null ? null : JSON.stringify(data.drawing);
    const body = bodyOf(data.body, drawing !== null);
    if (!Number.isInteger(data.timecodeMs) || data.timecodeMs < 0) refuse(400, "invalid-request");
    const now = Date.now();
    const db = getDb();
    const [inserted, existing] = await db.batch([
      db
        .insert(comments)
        .select(sql`SELECT ${data.id}, r.id, m.id, NULL, m.display_name,
          ${data.timecodeMs}, ${body}, ${drawing}, NULL, NULL, ${now}, NULL
        FROM revisions r JOIN members m ON m.id = ${member.id}
        WHERE r.id = ${data.revisionId} AND ${data.timecodeMs} <= r.duration_ms
          AND ${readyRevision(data.revisionId, data.videoId)} AND ${activeMember(member.id, "viewer")}`)
        .onConflictDoNothing()
        .returning({ id: comments.id }),
      db
        .select()
        .from(comments)
        .where(
          and(
            targetComment(data, member),
            sql`${data.timecodeMs} <= (SELECT duration_ms FROM revisions WHERE id = ${data.revisionId})`,
          ),
        ),
    ]);
    if (
      !inserted.length &&
      !(existing[0]?.memberId === member.id && existing[0]?.revisionId === data.revisionId)
    )
      refuse(400, "invalid-request");
    return { id: data.id };
  });

export const editComment = createServerFn({ method: "POST" })
  .validator((data: CommentTarget & { body: string }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    validTarget(data);
    const body = bodyOf(data.body, true);
    const [written] = await getDb()
      .update(comments)
      .set({ body, editedAt: Date.now() })
      .where(
        and(
          targetComment(data, member),
          eq(comments.memberId, member.id),
          body.trim() ? undefined : sql`${comments.drawing} IS NOT NULL`,
        ),
      )
      .returning({ id: comments.id });
    if (!written) {
      if (!body.trim()) refuse(400, "invalid-request");
      refuse(404, "not-found");
    }
    return written;
  });

export const deleteComment = createServerFn({ method: "POST" })
  .validator((data: CommentTarget) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("viewer");
    validTarget(data);
    const [written] = await getDb()
      .delete(comments)
      .where(
        and(
          targetComment(data, member),
          or(eq(comments.memberId, member.id), activeMember(member.id, "owner")),
        ),
      )
      .returning({ id: comments.id });
    if (!written) refuse(404, "not-found");
    return written;
  });

export const resolveComment = createServerFn({ method: "POST" })
  .validator((data: CommentTarget & { resolved: boolean }) => data)
  .handler(async ({ data }) => {
    const member = await requireMember("editor");
    validTarget(data);
    if (typeof data.resolved !== "boolean") refuse(400, "invalid-request");
    const [written] = await getDb()
      .update(comments)
      .set({
        resolvedAt: data.resolved ? Date.now() : null,
        resolvedBy: data.resolved ? member.id : null,
      })
      .where(and(targetComment(data, member), activeMember(member.id, "editor")))
      .returning({ id: comments.id });
    if (!written) refuse(404, "not-found");
    return written;
  });
