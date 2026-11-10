import { refuse } from "@/server/access";
import { readDrawing, type Shape } from "@/lib/drawing";
import { comments } from "@/server/db/schema";

/** Lives apart from the server functions so importing it keeps Access out of the browser bundle. */
export const bodyOf = (body: string, hasDrawing = false) => {
  if (typeof body !== "string" || (!body.trim() && !hasDrawing) || body.length > 5000)
    refuse(400, "invalid-request");
  return body;
};

export const commentColumns = {
  id: comments.id,
  authorName: comments.authorName,
  timecodeMs: comments.timecodeMs,
  body: comments.body,
  drawing: comments.drawing,
  resolvedAt: comments.resolvedAt,
  createdAt: comments.createdAt,
  memberId: comments.memberId,
  shareLinkId: comments.shareLinkId,
};

/** The one Comment shape both review screens receive; it never carries Member or Share Link IDs. */
export type Comment = {
  id: string;
  authorName: string;
  timecodeMs: number;
  body: string;
  drawing: Shape[] | null;
  resolvedAt: number | null;
  createdAt: number;
  isGuest: boolean;
  /** Members only: whether the viewing Member wrote it. */
  mine?: boolean;
};

export function toComment(
  {
    memberId,
    shareLinkId,
    drawing,
    ...row
  }: { [K in keyof typeof commentColumns]: (typeof comments.$inferSelect)[K] },
  viewerMemberId?: string,
): Comment {
  const shapes = readDrawing(drawing);
  return {
    id: row.id,
    authorName: row.authorName,
    timecodeMs: row.timecodeMs,
    body: row.body,
    drawing: shapes.length ? shapes : null,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    isGuest: shareLinkId !== null,
    ...(viewerMemberId !== undefined && { mine: memberId === viewerMemberId }),
  };
}
