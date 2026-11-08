import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { canWrite } from "@/components/project-parts";
import { useCommentWrite, type Comment, type ReviewPage } from "@/lib/review";
import type { NewComment } from "@/server/comments";

export const timeLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function Comments({ page, videoId, timeMs, select, selectedId, cacheRevisionId }: {
  page: ReviewPage; videoId: string; timeMs: number; select: (comment: Comment) => void; selectedId: string | null; cacheRevisionId?: string;
}) {
  const write = useCommentWrite(videoId, cacheRevisionId);
  const [resolved, setResolved] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [failure, setFailure] = useState("");
  const draft = useRef<NewComment | null>(null);
  const tab = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const revision = page.revision!;
  const readOnly = page.video?.completedAt !== null;
  const rows = page.comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  const target = (id: string) => ({ id, videoId, revisionId: revision.id });
  function focusAfterRemoval() { requestAnimationFrame(() => tab.current?.focus()); }

  async function send() {
    if (!body.trim()) { setFailure("Enter a Comment."); composer.current?.focus(); return; }
    if (!draft.current || draft.current.body !== body || draft.current.revisionId !== revision.id) {
      draft.current = { ...target(crypto.randomUUID()), body, timecodeMs: timeMs };
    }
    const data = draft.current;
    setFailure("");
    setResolved(false);
    try {
      await write.mutateAsync({ action: "create", data, comment: {
        ...data, memberId: page.member.id, shareLinkId: null, authorName: page.member.displayName,
        drawing: null, resolvedAt: null, resolvedBy: null, createdAt: Date.now(), editedAt: null,
      } });
      setBody(""); draft.current = null;
    } catch { setFailure("Could not send Comment. Your text is kept; try again."); }
  }

  async function change(action: "delete" | "resolve" | "edit", comment: Comment) {
    setFailure("");
    try {
      const data = target(comment.id);
      const pending = action === "edit" ? write.mutateAsync({ action, data: { ...data, body: editedBody } })
        : action === "resolve" ? write.mutateAsync({ action, data: { ...data, resolved: !resolved } })
        : write.mutateAsync({ action, data });
      if (action !== "edit") focusAfterRemoval();
      await pending;
      if (action === "edit") { setEditing(null); focusAfterRemoval(); }
    } catch { setFailure(`Could not ${action} Comment. Try again.`); }
  }

  return <section aria-labelledby="comments-heading" className="min-w-0 rounded-lg border p-4">
    <h2 id="comments-heading" className="font-semibold">Comments</h2>
    <div role="group" aria-label="Comment filters" className="my-3 flex gap-2">
      <Button ref={!resolved ? tab : undefined} aria-pressed={!resolved} onClick={() => setResolved(false)}>To do</Button>
      <Button ref={resolved ? tab : undefined} aria-pressed={resolved} onClick={() => setResolved(true)}>Resolved</Button>
    </div>
    {rows.length === 0 ? <p className="text-muted-foreground">{resolved ? "No Resolved Comments." : "No Comments to do."}</p> : <ul className="space-y-4" aria-label="Comments">
      {rows.map((comment) => <li key={comment.id} className="rounded border p-3 wrap-anywhere">
        <p className="text-sm">{comment.authorName}{comment.shareLinkId && " · Guest"}</p>
        <button className="min-h-11 w-full text-left underline" aria-current={selectedId === comment.id ? "true" : undefined}
          onClick={() => select(comment)}>{timeLabel(comment.timecodeMs)} · {comment.body}</button>
        {editing === comment.id ? <form onSubmit={(event) => { event.preventDefault(); void change("edit", comment); }}>
          <label className="block">Edit Comment text<textarea className="min-h-24 w-full rounded border p-2" maxLength={5000} required value={editedBody} onChange={(event) => setEditedBody(event.target.value)} readOnly={write.isPending} /></label>
          <Button disabled={write.isPending} type="submit">Save Comment</Button>
          <Button type="button" onClick={() => { setEditing(null); focusAfterRemoval(); }}>Cancel edit</Button>
        </form> : <div className="flex flex-wrap items-center gap-2">
          {!readOnly && canWrite(page.member.role) && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={comment.resolvedAt !== null} disabled={write.isPending}
            onChange={() => void change("resolve", comment)} />{resolved ? "Unresolve Comment" : "Resolve Comment"}</label>}
          {!readOnly && comment.memberId === page.member.id && <Button variant="outline" disabled={write.isPending} onClick={() => { setEditedBody(comment.body); setEditing(comment.id); }}>Edit Comment</Button>}
          {!readOnly && (comment.memberId === page.member.id || page.member.role === "owner") && <Button variant="outline" disabled={write.isPending} onClick={() => void change("delete", comment)}>Delete Comment</Button>}
        </div>}
      </li>)}
    </ul>}
    {failure && <p role="alert" className="my-3">{failure}</p>}
    {readOnly ? <p className="mt-4">This Project is Complete. Comments are read-only.</p> : <form className="sticky bottom-0 mt-4 border-t bg-background py-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="block" htmlFor="comment-body">Comment text</label>
      <textarea ref={composer} id="comment-body" className="min-h-24 w-full rounded border p-2" maxLength={5000} value={body} onChange={(event) => { setBody(event.target.value); draft.current = null; }} readOnly={write.isPending} />
      <p className="text-sm">At {timeLabel(timeMs)}</p>
      <Button type="submit" disabled={write.isPending}>Send Comment</Button>
    </form>}
  </section>;
}
