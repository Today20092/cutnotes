import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDrawingControls } from "@/components/drawing-controls";
import { VideoPlayer } from "@/components/player/video-player";
import { toastManager } from "@/components/ui/toast";
import { activeCommentId } from "@/lib/comment-time";
import { COMMENT_UNDO_MS, type Comment } from "@/lib/review";
import { cn } from "@/lib/utils";
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
        <label className="text-sm font-medium tabular-nums" htmlFor="comment-body">
          Add a Comment at {timeLabel(timeMs)}
        </label>
        <p id="comment-time" className="sr-only">
          The Comment is attached to this moment in the Video.
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
        <Button type="submit" className="ml-auto px-4" disabled={pending}>
          Send Comment
        </Button>
      </div>
    </form>
  );
}

export type Draft = { id: string; body: string; timecodeMs: number; drawing: Shape[] | null };

/** What differs between a Member and a Guest on the review screen. */
export type CommentActor = {
  writable: boolean;
  closedNote: string;
  pending: boolean;
  send: (draft: Draft) => Promise<unknown>;
  sendFailure?: (error: unknown) => string;
  resolve?: (comment: Comment, resolved: boolean) => Promise<unknown>;
  /** Offered only on the viewer's own Comments. */
  edit?: (comment: Comment, body: string) => Promise<unknown>;
  /** Hides the Comment now and deletes it after the Undo window; returns Undo. */
  remove?: (comment: Comment, failed: () => void) => () => void;
  mayRemove?: (comment: Comment) => boolean;
};

export function Review({
  videoId,
  revision,
  playback,
  comments,
  renewPlayback,
  actor,
}: {
  videoId: string;
  revision: { id: string; frameRate: number | null; durationMs: number | null };
  playback: ComponentProps<typeof VideoPlayer>["playback"];
  comments: Comment[];
  renewPlayback?: ComponentProps<typeof VideoPlayer>["renewPlayback"];
  actor: CommentActor;
}) {
  const [seek, setSeek] = useState<{ timeMs: number }>();
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pen = useDrawingControls({
    timeMs,
    seek: (ms) => setSeek({ timeMs: ms }),
    deselect: () => setSelectedId(null),
  });
  function select(comment: Comment) {
    setSeek({ timeMs: comment.timecodeMs });
    setSelectedId(comment.id);
    setTimeMs(comment.timecodeMs);
    pen.stop();
  }
  return (
    <div className="review-layout">
      <div
        className="review-player"
        onTimeUpdate={(event) => {
          if (event.target instanceof HTMLVideoElement)
            setTimeMs(Math.round(event.target.currentTime * 1000));
        }}
      >
        <VideoPlayer
          videoId={videoId}
          revisionId={revision.id}
          frameRate={revision.frameRate}
          playback={playback}
          seek={seek}
          drawing={pen.overlay(
            selectedId === null
              ? undefined
              : { drawing: comments.find((c) => c.id === selectedId)?.drawing ?? null },
          )}
          renewPlayback={renewPlayback}
          timelineMarkers={
            <CommentMarkers
              comments={comments}
              durationMs={revision.durationMs}
              selectedId={selectedId}
              select={select}
            />
          }
        />
      </div>
      <Comments
        comments={comments}
        scope={revision.id}
        actor={actor}
        timeMs={pen.time}
        select={select}
        selectedId={selectedId}
        drawing={pen.drawing}
        sent={pen.reset}
        drawingControls={actor.writable && pen.controls}
      />
    </div>
  );
}

function Comments({
  comments,
  scope,
  actor,
  timeMs,
  select,
  selectedId,
  drawing,
  sent,
  drawingControls,
}: {
  comments: Comment[];
  /** A new Revision starts a new draft ID. */
  scope: string;
  actor: CommentActor;
  timeMs: number;
  select: (comment: Comment) => void;
  selectedId: string | null;
  drawing: Shape[];
  sent: () => void;
  drawingControls: ReactNode;
}) {
  const [resolved, setResolved] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [failure, setFailure] = useState("");
  const [status, setStatus] = useState("");
  const draft = useRef<(Draft & { scope: string }) | null>(null);
  const tab = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  // Edit replaces the button that held focus.
  useEffect(() => {
    if (editing) editor.current?.focus();
  }, [editing]);
  const rows = comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  const { pending } = actor;
  const activeId = activeCommentId(rows, timeMs);
  function focusAfterRemoval() {
    requestAnimationFrame(() => tab.current?.focus());
  }
  /** The status region speaks it; the toast shows it to everyone else. */
  function announce(message: string) {
    setStatus(message);
    toastManager.add({ title: message });
  }
  function removeComment(comment: Comment) {
    setFailure("");
    const undo = actor.remove!(comment, () => setFailure("Could not delete Comment. Try again."));
    focusAfterRemoval();
    setStatus("Comment deleted");
    const toastId = toastManager.add({
      title: "Comment deleted",
      timeout: COMMENT_UNDO_MS,
      actionProps: {
        children: "Undo",
        onClick: () => {
          undo();
          toastManager.close(toastId);
          announce("Comment restored");
        },
      },
    });
  }

  async function send() {
    if (!body.trim() && !drawing.length) {
      setFailure("Enter a Comment.");
      composer.current?.focus();
      return;
    }
    const marks = drawing.length ? drawing : null;
    // A retry of the same text keeps its ID, so the server ignores the duplicate.
    if (
      draft.current?.body !== body ||
      draft.current.scope !== scope ||
      JSON.stringify(draft.current.drawing) !== JSON.stringify(marks)
    )
      draft.current = { id: crypto.randomUUID(), scope, body, timecodeMs: timeMs, drawing: marks };
    const { scope: _, ...data } = draft.current;
    setFailure("");
    setStatus("");
    setResolved(false);
    try {
      await actor.send(data);
      setBody("");
      draft.current = null;
      sent();
      announce(`Comment added at ${timeLabel(data.timecodeMs)}`);
      if (document.activeElement === document.body) composer.current?.focus(); // Send disables while pending, which can drop focus.
    } catch (error) {
      setFailure(
        actor.sendFailure?.(error) ?? "Could not send Comment. Your text is kept; try again.",
      );
    }
  }

  async function change(action: "resolve" | "edit", comment: Comment) {
    setFailure("");
    setStatus("");
    try {
      const write =
        action === "edit" ? actor.edit!(comment, editedBody) : actor.resolve!(comment, !resolved);
      if (action !== "edit") focusAfterRemoval();
      await write;
      announce(
        action === "edit"
          ? "Comment edited"
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
      {actor.writable ? (
        <CommentComposer
          composer={composer}
          body={body}
          setBody={setBody}
          timeMs={timeMs}
          pending={pending}
          send={() => void send()}
          drawingControls={drawingControls}
        />
      ) : (
        <p className="mt-3 text-muted-foreground">{actor.closedNote}</p>
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
          {rows.map((comment) => {
            const at = `Comment by ${comment.authorName} at ${timeLabel(comment.timecodeMs)}`;
            const canEdit = actor.edit && comment.mine;
            const canRemove = actor.remove && actor.mayRemove?.(comment);
            return (
              <li
                key={comment.id}
                className={cn(
                  "py-3 wrap-anywhere",
                  comment.id === activeId && "-mx-2 rounded-lg bg-muted/60 px-2",
                )}
              >
                <p className="text-sm text-muted-foreground">
                  {comment.authorName}
                  {comment.isGuest && " · Guest"}
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
                        readOnly={pending}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={pending} type="submit">
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
                  (actor.resolve || canEdit || canRemove) && (
                    <div className="flex flex-wrap items-center gap-x-1">
                      {actor.resolve && (
                        <label className="flex min-h-11 items-center gap-2 pr-2 text-sm">
                          <Checkbox
                            aria-label={`${resolved ? "Unresolve" : "Resolve"} ${at}`}
                            checked={comment.resolvedAt !== null}
                            disabled={pending}
                            onCheckedChange={() => void change("resolve", comment)}
                          />
                          {resolved ? "Unresolve" : "Resolve"}
                        </label>
                      )}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          aria-label={`Edit ${at}`}
                          disabled={pending}
                          onClick={() => {
                            setEditedBody(comment.body);
                            setEditing(comment.id);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {canRemove && (
                        <Button
                          variant="ghost"
                          aria-label={`Delete ${at}`}
                          disabled={pending}
                          onClick={() => removeComment(comment)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
