import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { canWrite } from "@/components/project-parts";
import { useCommentWrite, type Comment, type ReviewPage } from "@/lib/review";
import type { NewComment } from "@/server/comments";
import type { Shape } from "@/lib/drawing";

export const timeLabel = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

/** Selected without relying on colour, so it survives forced colours. */
export const selectedRowClass =
  "aria-[current=true]:border-l-4 aria-[current=true]:border-current aria-[current=true]:pl-2 aria-[current=true]:font-semibold";

/** Shared by the Member and Guest lists; the underline survives forced colours. */
const segmentClass =
  "h-11 aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-4 sm:h-8";

export function CommentMarkers<
  Row extends { id: string; timecodeMs: number; body: string; resolvedAt: number | null },
>({
  comments,
  durationMs,
  selectedId,
  select,
}: {
  comments: Row[];
  durationMs: number | null;
  selectedId: string | null;
  select: (comment: Row) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, marker: 24 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry!.contentRect.width,
        marker: 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      }),
    );
    observer.observe(track.current!);
    return () => observer.disconnect();
  }, []);
  const left = (comment: Row) =>
    Math.max(2, Math.min(98, (comment.timecodeMs / (durationMs || 1)) * 100));
  // Targets are 1.5rem wide, including enlarged text. Every Comment stays selectable in the list.
  const groups: Row[][] = [];
  for (const comment of [...comments].sort((a, b) => a.timecodeMs - b.timecodeMs)) {
    const group = groups.at(-1);
    if (group && size.width && ((left(comment) - left(group[0]!)) * size.width) / 100 < size.marker)
      group.push(comment);
    else groups.push([comment]);
  }
  return (
    <div
      ref={track}
      role="group"
      aria-label="Comment timeline markers"
      className="relative mx-2.5 h-6"
    >
      {groups.map((group) => {
        const first = group[0]!;
        const time = timeLabel(first.timecodeMs);
        return (
          <button
            key={first.id}
            type="button"
            className="absolute inset-y-0 w-6 -translate-x-1/2 rounded-full text-center text-[0.625rem] leading-6 focus-visible:outline-2 aria-[current=true]:bg-white aria-[current=true]:text-black forced-colors:aria-[current=true]:outline-2"
            style={{ left: `${left(first)}%` }}
            aria-label={
              group.length > 1
                ? `${group.length} Comments from ${time}`
                : `Comment at ${time}${first.resolvedAt === null ? "" : ", resolved"}: ${first.body}`
            }
            aria-current={group.some((comment) => comment.id === selectedId) ? "true" : undefined}
            onClick={() => select(first)}
          >
            {group.length > 1
              ? group.length > 99
                ? "99+"
                : group.length
              : first.resolvedAt === null
                ? "◆"
                : "◇"}
          </button>
        );
      })}
    </div>
  );
}

export function CommentFilter({
  resolved,
  setResolved,
  tab,
}: {
  resolved: boolean;
  setResolved: (resolved: boolean) => void;
  tab?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ToggleGroup
      aria-label="Comment filters"
      className="mt-6 mb-1"
      value={[resolved ? "resolved" : "todo"]}
      onValueChange={(next: string[]) => {
        if (next[0]) setResolved(next[0] === "resolved");
      }}
    >
      <ToggleGroupItem ref={!resolved ? tab : undefined} value="todo" className={segmentClass}>
        To do
      </ToggleGroupItem>
      <ToggleGroupItem ref={resolved ? tab : undefined} value="resolved" className={segmentClass}>
        Resolved
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function CommentComposer({
  body,
  setBody,
  timeMs,
  pending,
  send,
  composer,
  drawingControls,
}: {
  body: string;
  setBody: (body: string) => void;
  timeMs: number;
  pending: boolean;
  send: () => void;
  composer: RefObject<HTMLTextAreaElement | null>;
  drawingControls?: ReactNode;
}) {
  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium" htmlFor="comment-body">
          Comment text
        </label>
        <p id="comment-time" className="text-sm text-muted-foreground tabular-nums">
          At {timeLabel(timeMs)}
        </p>
      </div>
      <Textarea
        ref={composer}
        id="comment-body"
        aria-describedby="comment-time"
        className="min-h-20"
        maxLength={5000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        readOnly={pending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {drawingControls}
        <Button type="submit" className="ml-auto min-h-11 px-4 sm:min-h-8" disabled={pending}>
          Send Comment
        </Button>
      </div>
    </form>
  );
}

export function Comments({
  page,
  videoId,
  timeMs,
  select,
  selectedId,
  drawing = [],
  sent,
  drawingControls,
  cacheRevisionId,
}: {
  page: ReviewPage;
  videoId: string;
  timeMs: number;
  select: (comment: Comment) => void;
  selectedId: string | null;
  cacheRevisionId?: string;
  drawing?: Shape[];
  sent?: () => void;
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
  const editor = useRef<HTMLTextAreaElement>(null);
  // Edit replaces the button that held focus.
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  const revision = page.revision!;
  const readOnly = page.video?.completedAt !== null;
  const rows = page.comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  const target = (id: string) => ({ id, videoId, revisionId: revision.id });
  function focusAfterRemoval() {
    requestAnimationFrame(() => tab.current?.focus());
  }

  async function send() {
    if (!body.trim() && !drawing.length) {
      setFailure("Enter a Comment.");
      composer.current?.focus();
      return;
    }
    if (
      !draft.current ||
      draft.current.body !== body ||
      draft.current.revisionId !== revision.id ||
      JSON.stringify(draft.current.drawing) !== JSON.stringify(drawing.length ? drawing : null)
    ) {
      draft.current = {
        ...target(crypto.randomUUID()),
        body,
        timecodeMs: timeMs,
        drawing: drawing.length ? drawing : null,
      };
    }
    const data = draft.current;
    setFailure("");
    setStatus("");
    setResolved(false);
    try {
      await write.mutateAsync({
        action: "create",
        data,
        comment: {
          ...data,
          memberId: page.member.id,
          shareLinkId: null,
          authorName: page.member.displayName,
          drawing: data.drawing ? JSON.stringify(data.drawing) : null,
          resolvedAt: null,
          resolvedBy: null,
          createdAt: Date.now(),
          editedAt: null,
        },
      });
      setBody("");
      draft.current = null;
      sent?.();
      setStatus(`Comment added at ${timeLabel(data.timecodeMs)}`);
      if (document.activeElement === document.body) composer.current?.focus(); // Send disables while pending, which can drop focus.
    } catch {
      setFailure("Could not send Comment. Your text is kept; try again.");
    }
  }

  async function change(action: "delete" | "resolve" | "edit", comment: Comment) {
    setFailure("");
    setStatus("");
    try {
      const data = target(comment.id);
      const pending =
        action === "edit"
          ? write.mutateAsync({ action, data: { ...data, body: editedBody } })
          : action === "resolve"
            ? write.mutateAsync({ action, data: { ...data, resolved: !resolved } })
            : write.mutateAsync({ action, data });
      if (action !== "edit") focusAfterRemoval();
      await pending;
      setStatus(
        action === "edit"
          ? "Comment edited"
          : action === "delete"
            ? "Comment deleted"
            : resolved
              ? "Comment moved to To do"
              : "Comment resolved",
      );
      if (action === "edit") {
        setEditing(null);
        focusAfterRemoval();
      }
    } catch {
      setFailure(`Could not ${action} Comment. Try again.`);
    }
  }

  return (
    <section
      id="comments"
      tabIndex={-1}
      aria-labelledby="comments-heading"
      className="min-w-0 outline-none"
    >
      <h2 id="comments-heading" className="text-lg font-semibold">
        Comments
      </h2>
      <p role="status" className="sr-only">
        {status}
      </p>
      {readOnly ? (
        <p className="mt-3 text-muted-foreground">
          This Project is Complete. Comments are read-only.
        </p>
      ) : (
        <CommentComposer
          composer={composer}
          body={body}
          setBody={(value) => {
            setBody(value);
            draft.current = null;
          }}
          timeMs={timeMs}
          pending={write.isPending}
          send={() => void send()}
          drawingControls={drawingControls}
        />
      )}
      {failure && (
        <p role="alert" className="my-3">
          {failure}
        </p>
      )}
      <CommentFilter resolved={resolved} setResolved={setResolved} tab={tab} />
      {rows.length === 0 ? (
        <p className="py-3 text-muted-foreground">
          {resolved ? "No Resolved Comments." : "No Comments to do."}
        </p>
      ) : (
        <ul className="divide-y" aria-label="Comments">
          {rows.map((comment) => (
            <li key={comment.id} className="py-3 wrap-anywhere">
              <p className="text-sm text-muted-foreground">
                {comment.authorName}
                {comment.shareLinkId && " · Guest"}
              </p>
              <button
                className={`min-h-11 w-full text-left ${selectedRowClass}`}
                aria-current={selectedId === comment.id ? "true" : undefined}
                onClick={() => select(comment)}
              >
                <span className="font-semibold tabular-nums underline underline-offset-4">
                  {timeLabel(comment.timecodeMs)}
                </span>{" "}
                · {comment.body}
                {comment.drawing && " · Drawing"}
              </button>
              {editing === comment.id ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void change("edit", comment);
                  }}
                >
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Edit Comment text
                    <Textarea
                      ref={editor}
                      className="min-h-24"
                      maxLength={5000}
                      required={!comment.drawing}
                      value={editedBody}
                      onChange={(event) => setEditedBody(event.target.value)}
                      readOnly={write.isPending}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={write.isPending} type="submit">
                      Save Comment
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null);
                        focusAfterRemoval();
                      }}
                    >
                      Cancel edit
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-x-1">
                  {!readOnly && canWrite(page.member.role) && (
                    <label className="flex min-h-11 items-center gap-2 pr-2 text-sm">
                      <Checkbox
                        aria-label={`${resolved ? "Unresolve" : "Resolve"} Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`}
                        checked={comment.resolvedAt !== null}
                        disabled={write.isPending}
                        onCheckedChange={() => void change("resolve", comment)}
                      />
                      {resolved ? "Unresolve" : "Resolve"}
                    </label>
                  )}
                  {!readOnly && comment.memberId === page.member.id && (
                    <Button
                      variant="ghost"
                      className="min-h-11 sm:min-h-8"
                      aria-label={`Edit Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`}
                      disabled={write.isPending}
                      onClick={() => {
                        setEditedBody(comment.body);
                        setEditing(comment.id);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {!readOnly &&
                    (comment.memberId === page.member.id || page.member.role === "owner") && (
                      <Button
                        variant="ghost"
                        className="min-h-11 sm:min-h-8"
                        aria-label={`Delete Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`}
                        disabled={write.isPending}
                        onClick={() => void change("delete", comment)}
                      >
                        Delete
                      </Button>
                    )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
