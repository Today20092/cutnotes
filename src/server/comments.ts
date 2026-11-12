import { createServerFn } from "@tanstack/react-start";
import { and, eq, or, sql } from "drizzle-orm";
import * as v from "valibot";
import { activeMember, parse, readyRevision, refuse, requireMember } from "@/server/access";
import { bodyOf } from "@/server/comment-rules";
import { getDb } from "@/server/db";
import { comments, type Member } from "@/server/db/schema";
import { validDrawing, type Shape } from "@/lib/drawing";

// Bounded so forged input cannot bloat a query.
const idField = v.pipe(v.string(), v.nonEmpty(), v.maxLength(128));
const targetShape = { id: idField, videoId: idField, revisionId: idField };
const targetSchema = v.object(targetShape);
const newCommentSchema = v.object({
  ...targetShape,
  // bodyOf checks length and emptiness, because an empty body is allowed with a drawing.
  body: v.string(),
  timecodeMs: v.pipe(v.number(), v.integer(), v.minValue(0)),
  drawing: v.nullish(v.custom<Shape[]>(validDrawing)),
});
const editCommentSchema = v.object({ ...targetShape, body: v.string() });
const resolveCommentSchema = v.object({ ...targetShape, resolved: v.boolean() });

export type CommentTarget = v.InferInput<typeof targetSchema>;
export type NewComment = v.InferInput<typeof newCommentSchema>;

const targetComment = (data: CommentTarget, member: Member) =>
  and(
    eq(comments.id, data.id),
    eq(comments.revisionId, data.revisionId),
    readyRevision(data.revisionId, data.videoId),
    activeMember(member.id, "viewer"),
  );

export const createComment = createServerFn({ method: "POST" })
  .validator((data: NewComment) => data)
  .handler(async ({ data: raw }) => {
    const member = await requireMember("viewer");
    const data = parse(newCommentSchema, raw);
    const drawing = data.drawing == null ? null : JSON.stringify(data.drawing);
    const body = bodyOf(data.body, drawing !== null);
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
  .validator((data: v.InferInput<typeof editCommentSchema>) => data)
  .handler(async ({ data: raw }) => {
    const member = await requireMember("viewer");
    const data = parse(editCommentSchema, raw);
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
  .handler(async ({ data: raw }) => {
    const member = await requireMember("viewer");
    const data = parse(targetSchema, raw);
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
  .validator((data: v.InferInput<typeof resolveCommentSchema>) => data)
  .handler(async ({ data: raw }) => {
    const member = await requireMember("editor");
    const data = parse(resolveCommentSchema, raw);
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
