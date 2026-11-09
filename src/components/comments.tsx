import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { canWrite } from "@/components/project-parts";
import { useCommentWrite, type Comment, type ReviewPage } from "@/lib/review";
import type { NewComment } from "@/server/comments";
import type { Shape } from "@/lib/drawing";

export const timeLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Selected without relying on colour, so it survives forced colours. */
export const selectedRowClass = "aria-[current=true]:border-l-4 aria-[current=true]:border-current aria-[current=true]:pl-2 aria-[current=true]:font-semibold";

export function CommentMarkers<Row extends { id: string; timecodeMs: number; body: string; resolvedAt: number | null }>({ comments, durationMs, selectedId, select }: {
  comments: Row[]; durationMs: number | null; selectedId: string | null; select: (comment: Row) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, marker: 24 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({
      width: entry!.contentRect.width,
      marker: 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
    observer.observe(track.current!);
    return () => observer.disconnect();
  }, []);
  const left = (comment: Row) => Math.max(2, Math.min(98, comment.timecodeMs / (durationMs || 1) * 100));
  // Targets are 1.5rem wide, including enlarged text. Every Comment stays selectable in the list.
  const groups: Row[][] = [];
  for (const comment of [...comments].sort((a, b) => a.timecodeMs - b.timecodeMs)) {
    const group = groups.at(-1);
    if (group && size.width && (left(comment) - left(group[0]!)) * size.width / 100 < size.marker) group.push(comment);
    else groups.push([comment]);
  }
  return <div ref={track} role="group" aria-label="Comment timeline markers" className="relative mt-2 h-12 border-b-2 border-current">
    {groups.map((group) => {
      const first = group[0]!;
      const time = timeLabel(first.timecodeMs);
      return <button key={first.id} type="button"
        className="absolute bottom-0 min-h-11 w-6 -translate-x-1/2 border-current text-center text-xs focus-visible:outline-2 aria-[current=true]:border-2"
        style={{ left: `${left(first)}%` }}
        aria-label={group.length > 1 ? `${group.length} Comments from ${time}` : `Comment at ${time}${first.resolvedAt === null ? "" : ", resolved"}: ${first.body}`}
        aria-current={group.some((comment) => comment.id === selectedId) ? "true" : undefined}
        onClick={() => select(first)}>{group.length > 1 ? group.length > 99 ? "99+" : group.length : first.resolvedAt === null ? "◆" : "◇"}</button>;
    })}
  </div>;
}

export function Comments({ page, videoId, timeMs, select, selectedId, drawing = [], sent, drawingControls, cacheRevisionId }: {
  page: ReviewPage; videoId: string; timeMs: number; select: (comment: Comment) => void; selectedId: string | null; cacheRevisionId?: string;
  drawing?: Shape[]; sent?: () => void;
  drawingControls?: ReactNode;
}) {
  const write = useCommentWrite(videoId, cacheRevisionId);
  const [resolved, setResolved] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [failure, setFailure] = useState("");
  const [status, setStatus] = useState("");
  const draft = useRef<NewComment | null>(null);
  const tab = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const revision = page.revision!;
  const readOnly = page.video?.completedAt !== null;
  const rows = page.comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  const target = (id: string) => ({ id, videoId, revisionId: revision.id });
  function focusAfterRemoval() { requestAnimationFrame(() => tab.current?.focus()); }

  async function send() {
    if (!body.trim() && !drawing.length) { setFailure("Enter a Comment."); composer.current?.focus(); return; }
    if (!draft.current || draft.current.body !== body || draft.current.revisionId !== revision.id || JSON.stringify(draft.current.drawing) !== JSON.stringify(drawing.length ? drawing : null)) {
      draft.current = { ...target(crypto.randomUUID()), body, timecodeMs: timeMs, drawing: drawing.length ? drawing : null };
    }
    const data = draft.current;
    setFailure("");
    setStatus("");
    setResolved(false);
    try {
      await write.mutateAsync({ action: "create", data, comment: {
        ...data, memberId: page.member.id, shareLinkId: null, authorName: page.member.displayName,
        drawing: data.drawing ? JSON.stringify(data.drawing) : null, resolvedAt: null, resolvedBy: null, createdAt: Date.now(), editedAt: null,
      } });
      setBody(""); draft.current = null; sent?.();
      setStatus(`Comment added at ${timeLabel(data.timecodeMs)}`);
      if (document.activeElement === document.body) composer.current?.focus(); // Send disables while pending, which can drop focus.
    } catch { setFailure("Could not send Comment. Your text is kept; try again."); }
  }

  async function change(action: "delete" | "resolve" | "edit", comment: Comment) {
    setFailure("");
    setStatus("");
    try {
      const data = target(comment.id);
      const pending = action === "edit" ? write.mutateAsync({ action, data: { ...data, body: editedBody } })
        : action === "resolve" ? write.mutateAsync({ action, data: { ...data, resolved: !resolved } })
        : write.mutateAsync({ action, data });
      if (action !== "edit") focusAfterRemoval();
      await pending;
      setStatus(action === "edit" ? "Comment edited" : action === "delete" ? "Comment deleted" : resolved ? "Comment moved to To do" : "Comment resolved");
      if (action === "edit") { setEditing(null); focusAfterRemoval(); }
    } catch { setFailure(`Could not ${action} Comment. Try again.`); }
  }

  return <section id="comments" tabIndex={-1} aria-labelledby="comments-heading" className="min-w-0 rounded-lg border p-4">
    <h2 id="comments-heading" className="font-semibold">Comments</h2>
    <p role="status" className="sr-only">{status}</p>
    {drawingControls}
    <div role="group" aria-label="Comment filters" className="my-3 flex flex-wrap gap-2">
      <Button ref={!resolved ? tab : undefined} aria-pressed={!resolved} onClick={() => setResolved(false)}>To do</Button>
      <Button ref={resolved ? tab : undefined} aria-pressed={resolved} onClick={() => setResolved(true)}>Resolved</Button>
    </div>
    {rows.length === 0 ? <p className="text-muted-foreground">{resolved ? "No Resolved Comments." : "No Comments to do."}</p> : <ul className="space-y-4" aria-label="Comments">
      {rows.map((comment) => <li key={comment.id} className="rounded border p-3 wrap-anywhere">
        <p className="text-sm">{comment.authorName}{comment.shareLinkId && " · Guest"}</p>
        <button className={`min-h-11 w-full text-left underline ${selectedRowClass}`} aria-current={selectedId === comment.id ? "true" : undefined}
          onClick={() => select(comment)}>{timeLabel(comment.timecodeMs)} · {comment.body}{comment.drawing && " · Drawing"}</button>
        {editing === comment.id ? <form onSubmit={(event) => { event.preventDefault(); void change("edit", comment); }}>
          <label className="block">Edit Comment text<textarea autoFocus className="min-h-24 w-full rounded border border-input p-2" maxLength={5000} required={!comment.drawing} value={editedBody} onChange={(event) => setEditedBody(event.target.value)} readOnly={write.isPending} /></label>
          <Button disabled={write.isPending} type="submit">Save Comment</Button>
          <Button type="button" onClick={() => { setEditing(null); focusAfterRemoval(); }}>Cancel edit</Button>
        </form> : <div className="flex flex-wrap items-center gap-2">
          {!readOnly && canWrite(page.member.role) && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`${resolved ? "Unresolve" : "Resolve"} Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`} checked={comment.resolvedAt !== null} disabled={write.isPending}
            onChange={() => void change("resolve", comment)} />{resolved ? "Unresolve Comment" : "Resolve Comment"}</label>}
          {!readOnly && comment.memberId === page.member.id && <Button variant="outline" aria-label={`Edit Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`} disabled={write.isPending} onClick={() => { setEditedBody(comment.body); setEditing(comment.id); }}>Edit Comment</Button>}
          {!readOnly && (comment.memberId === page.member.id || page.member.role === "owner") && <Button variant="outline" aria-label={`Delete Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`} disabled={write.isPending} onClick={() => void change("delete", comment)}>Delete Comment</Button>}
        </div>}
      </li>)}
    </ul>}
    {failure && <p role="alert" className="my-3">{failure}</p>}
    {readOnly ? <p className="mt-4">This Project is Complete. Comments are read-only.</p> : <form className="mt-4 border-t bg-background py-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="block" htmlFor="comment-body">Comment text</label>
      <textarea ref={composer} id="comment-body" aria-describedby="comment-time" className="min-h-24 w-full rounded border border-input p-2" maxLength={5000} value={body} onChange={(event) => { setBody(event.target.value); draft.current = null; }} readOnly={write.isPending} />
      <p id="comment-time" className="text-sm">At {timeLabel(timeMs)}</p>
      <Button type="submit" disabled={write.isPending}>Send Comment</Button>
    </form>}
  </section>;
}
