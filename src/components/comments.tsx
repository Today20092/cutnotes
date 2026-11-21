import { createParts } from "@ui-sdk/react/primitive";
import { Link } from "@tanstack/react-router";
import { commentList } from "@/lib/comment-list";
import { PersonAvatar } from "@/components/person-avatar";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { PlaybackComments } from "@/components/playback-comments";
import { PendingButton } from "@/components/pending-button";
import { Pencil } from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import { activeCommentId, frameTime, spokenFrameTime } from "@/lib/comment-time";
import { COMMENT_UNDO_MS, type Comment } from "@/lib/review";
import { cn } from "@/lib/utils";
import type { Shape } from "@/lib/drawing";

const CommentList = createParts(commentList, {
  root: "ul",
  row: "li",
  content: "div",
  action: "button",
});

/** Selected without relying on colour, so it survives forced colours. */
export const selectedRowClass =
  "aria-[current=true]:border-l-4 aria-[current=true]:border-current aria-[current=true]:pl-2 aria-[current=true]:font-semibold";

/** Shared by the Member and Guest lists; the underline marks the choice without relying on colour. */
const segmentClass =
  "h-11 aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-4 sm:pointer-fine:h-8";

export function CommentMarkers<
  Row extends { id: string; timecodeMs: number; body: string; resolvedAt: number | null },
>({
  comments,
  durationMs,
  frameRate,
  selectedId,
  select,
}: {
  comments: Row[];
  durationMs: number | null;
  frameRate: number | null;
  selectedId: string | null;
  select: (comment: Row) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, marker: 24 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry!.contentRect.width,
        marker:
          (matchMedia("(pointer: coarse)").matches ? 2.75 : 1.5) *
          parseFloat(getComputedStyle(document.documentElement).fontSize),
      }),
    );
    observer.observe(track.current!);
    return () => observer.disconnect();
  }, []);
  const left = (comment: Row) =>
    Math.max(2, Math.min(98, (comment.timecodeMs / (durationMs || 1)) * 100));
  // Targets are 1.5rem wide (2.75rem on a touch screen), including enlarged text. Every Comment stays selectable in the list.
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
      className="relative mx-2.5 h-6 pointer-coarse:h-11"
    >
      {groups.map((group) => {
        const first = group[0]!;
        const time = spokenFrameTime(first.timecodeMs, frameRate);
        return (
          <button
            key={first.id}
            type="button"
            className="absolute inset-y-0 w-6 -translate-x-1/2 rounded-full text-center text-xs leading-6 pointer-coarse:w-11 pointer-coarse:leading-11 focus-visible:outline-2 aria-[current=true]:bg-white aria-[current=true]:text-black forced-colors:aria-[current=true]:outline-2"
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
  todoCount,
}: {
  resolved: boolean;
  setResolved: (resolved: boolean) => void;
  tab?: RefObject<HTMLButtonElement | null>;
  todoCount: number;
}) {
  return (
    <ToggleGroup
      aria-label="Comment filters"
      variant="outline"
      className="mt-6 mb-1 max-w-full flex-wrap"
      value={[resolved ? "resolved" : "todo"]}
      onValueChange={(next: string[]) => {
        if (next[0]) setResolved(next[0] === "resolved");
      }}
    >
      <ToggleGroupItem ref={!resolved ? tab : undefined} value="todo" className={segmentClass}>
        To do ({todoCount})
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
  frameRate,
  pending,
  send,
  composer,
  drawingControls,
}: {
  body: string;
  setBody: (body: string) => void;
  timeMs: number;
  frameRate: number | null;
  pending: boolean;
  send: () => void;
  composer: RefObject<HTMLTextAreaElement | null>;
  drawingControls?: ReactNode;
}) {
  return (
    <form
      className="mt-3 flex flex-col gap-3 rounded-card border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium tabular-nums" htmlFor="comment-body">
          Add a Comment at <span aria-hidden="true">{frameTime(timeMs, frameRate)}</span>
          <span className="sr-only">{spokenFrameTime(timeMs, frameRate)}</span>
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
        <PendingButton type="submit" className="w-full px-4" pending={pending}>
          Send Comment
        </PendingButton>
      </div>
    </form>
  );
}

/** What the review screen keeps in its URL: the selected Comment, a moment to open at, and the filter. */
export type ReviewView = { comment?: string; t?: number; filter?: "todo" | "resolved" };

export type Draft = { id: string; body: string; timecodeMs: number; drawing: Shape[] | null };

/** What differs between a Member and a Guest on the review screen. */
export type CommentActor = {
  writable: boolean;
  guest?: boolean;
  linkAuthors?: boolean;
  closedNote: string;
  pending: boolean;
  send: (draft: Draft) => Promise<unknown>;
  sendFailure?: (error: unknown) => string;
  resolve?: (
    comment: Comment,
    resolved: boolean,
    expectedResolvedAt?: number,
  ) => Promise<number | null>;
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
  view,
  onViewChange,
  belowPlayer,
  emptyToDo,
}: {
  /** Shown right under the player, such as the review decision. */
  belowPlayer?: ReactNode;
  emptyToDo?: ReactNode;
  view: ReviewView;
  /** Writes the changed keys to the URL; `undefined` removes one. */
  onViewChange: (change: Partial<ReviewView>) => void;
  videoId: string;
  revision: { id: string; frameRate: number | null; durationMs: number | null };
  playback: ComponentProps<typeof VideoPlayer>["playback"];
  comments: Comment[];
  renewPlayback?: ComponentProps<typeof VideoPlayer>["renewPlayback"];
  actor: CommentActor;
}) {
  const [seek, setSeek] = useState<{ timeMs: number }>();
  const [timeMs, setTimeMs] = useState(0);
  const selected = comments.find((comment) => comment.id === view.comment);
  const selectedId = selected?.id ?? null;
  const showComments = !actor.guest || actor.writable;
  const pen = useDrawingControls({
    timeMs,
    seek: (ms) => setSeek({ timeMs: ms }),
    deselect: () => onViewChange({ comment: undefined }),
  });
  // A link opens at its Comment, or at its `t`.
  useEffect(() => {
    // A Resolved Comment's link shows the Resolved list.
    if (!actor.guest && selected?.resolvedAt != null && !view.filter)
      onViewChange({ filter: "resolved" });
    const at = selected?.timecodeMs ?? (view.t === undefined ? undefined : view.t * 1000);
    if (at === undefined) return;
    setSeek({ timeMs: at });
    setTimeMs(at);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Runs once, on arrival: later selections come from clicks.
  }, []);
  function select(comment: Comment) {
    setSeek({ timeMs: comment.timecodeMs });
    setTimeMs(comment.timecodeMs);
    onViewChange({ comment: comment.id, t: undefined });
    pen.stop();
  }
  return (
    <div
      className="review-layout"
      style={showComments ? undefined : { gridTemplateColumns: "minmax(0, 1fr)" }}
    >
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
          commentPreview={
            showComments && (
              <PlaybackComments
                comments={comments}
                timeMs={timeMs}
                frameRate={revision.frameRate}
                read={(comment) => {
                  select(comment);
                  requestAnimationFrame(() => {
                    const row = document.getElementById(`comment-${comment.id}`);
                    row?.scrollIntoView({ block: "nearest" });
                    row?.querySelector<HTMLButtonElement>("button")?.focus();
                  });
                }}
              />
            )
          }
          timelineMarkers={
            showComments && (
              <CommentMarkers
                comments={comments}
                durationMs={revision.durationMs}
                frameRate={revision.frameRate}
                selectedId={selectedId}
                select={select}
              />
            )
          }
        />
      </div>
      {belowPlayer}
      {showComments && (
        <Comments
          comments={comments}
          scope={revision.id}
          actor={actor}
          timeMs={pen.time}
          frameRate={revision.frameRate}
          emptyToDo={emptyToDo}
          select={select}
          selectedId={selectedId}
          drawing={pen.drawing}
          resolved={view.filter === "resolved"}
          setResolved={(next) => onViewChange({ filter: next ? "resolved" : undefined })}
          sent={pen.reset}
          drawingControls={actor.writable && pen.controls}
        />
      )}
    </div>
  );
}

function Comments({
  comments,
  scope,
  actor,
  timeMs,
  frameRate,
  select,
  selectedId,
  drawing,
  resolved,
  setResolved,
  emptyToDo,
  sent,
  drawingControls,
}: {
  resolved: boolean;
  setResolved: (resolved: boolean) => void;
  comments: Comment[];
  /** A new Revision starts a new draft ID. */
  scope: string;
  actor: CommentActor;
  timeMs: number;
  frameRate: number | null;
  select: (comment: Comment) => void;
  selectedId: string | null;
  drawing: Shape[];
  emptyToDo?: ReactNode;
  sent: () => void;
  drawingControls: ReactNode;
}) {
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
  const todoCount = comments.filter((comment) => comment.resolvedAt === null).length;
  const rows = actor.guest
    ? comments
    : comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  const actionable =
    actor.resolve && !resolved
      ? rows.map((comment) => ({
          id: comment.id,
          label: comment.body || "Drawing",
          removable: !!actor.mayRemove?.(comment),
        }))
      : [];
  const { pending } = actor;
  const activeId = activeCommentId(rows, timeMs);
  function focusAfterRemoval() {
    requestAnimationFrame(() => tab.current?.focus());
  }
  /** The status region speaks it; the toast shows it to everyone else. */
  function announce(message: string) {
    setStatus(message);
    toast({ title: message });
  }
  function removeComment(comment: Comment) {
    setFailure("");
    const undo = actor.remove!(comment, () => setFailure("Could not delete Comment. Try again."));
    focusAfterRemoval();
    setStatus("Comment deleted");
    toast({
      title: "Comment deleted",
      duration: COMMENT_UNDO_MS,
      action: {
        label: "Undo",
        onAction: () => {
          undo();
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
      announce(`Comment added at ${spokenFrameTime(data.timecodeMs, frameRate)}`);
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
      if (action === "edit") {
        await actor.edit!(comment, editedBody);
        announce("Comment edited");
        setEditing(null);
        focusAfterRemoval();
        return;
      }
      const write = actor.resolve!(comment, !resolved);
      focusAfterRemoval();
      const resolvedAt = await write;
      if (resolvedAt !== null) {
        setStatus("Comment resolved");
        toast({
          title: "Comment resolved",
          duration: COMMENT_UNDO_MS,
          action: {
            label: "Undo",
            onAction: async () => {
              try {
                await actor.resolve!(comment, false, resolvedAt);
                announce("Comment moved to To do");
              } catch {
                toast({ title: "Could not undo Resolve" });
              }
            },
          },
        });
      } else {
        announce("Comment moved to To do");
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
      <h2 id="comments-heading" className="text-section">
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
          frameRate={frameRate}
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
      {!actor.guest && (
        <CommentFilter
          resolved={resolved}
          setResolved={setResolved}
          tab={tab}
          todoCount={todoCount}
        />
      )}
      {rows.length === 0 ? (
        <Empty className="py-8 md:py-8">
          <EmptyHeader>
            <EmptyTitle className="text-sm font-normal text-muted-foreground">
              {actor.guest
                ? "No Comments yet."
                : resolved
                  ? "No Resolved Comments."
                  : "No Comments to do."}
            </EmptyTitle>
            {!actor.guest && !resolved && emptyToDo}
          </EmptyHeader>
        </Empty>
      ) : (
        <CommentList.Root
          className="divide-y"
          aria-label="Comments"
          comments={actionable}
          onResolve={(id) =>
            void change(
              "resolve",
              rows.find((row) => row.id === id)!,
            )
          }
          onRemove={(id) => removeComment(rows.find((row) => row.id === id)!)}
          onAddComment={
            actor.resolve && !resolved
              ? (timecodeMs, body) => {
                  actor
                    .send({ id: crypto.randomUUID(), body, timecodeMs, drawing: null })
                    .catch(() => setFailure("Could not send Comment. Try again."));
                }
              : undefined
          }
        >
          {rows.map((comment) => {
            const at = `Comment by ${comment.authorName} at ${spokenFrameTime(comment.timecodeMs, frameRate)}`;
            const canEdit = actor.edit && comment.mine;
            const canRemove = actor.remove && actor.mayRemove?.(comment);
            return (
              <CommentList.Row
                key={comment.id}
                value={comment.id}
                id={`comment-${comment.id}`}
                className={cn(
                  "relative isolate wrap-anywhere",
                  actor.resolve && !resolved && "touch-pan-y overflow-hidden",
                  comment.id === activeId && "-mx-2 rounded-lg",
                )}
              >
                <CommentList.Content
                  value={comment.id}
                  className={cn(
                    "relative z-10 bg-background py-3 transition-transform data-swiping:transition-none data-swiping:select-none motion-reduce:transition-none",
                    comment.id === activeId && "rounded-lg bg-muted px-2",
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      comment.id !== activeId && "text-muted-foreground",
                    )}
                  >
                    <PersonAvatar
                      name={comment.authorName}
                      src={comment.authorAvatarUrl}
                      className="size-6"
                    />
                    {actor.linkAuthors && !comment.isGuest ? (
                      <Link
                        to="/members"
                        search={{ q: comment.authorName, remove: undefined }}
                        className="underline underline-offset-4"
                      >
                        {comment.authorName}
                      </Link>
                    ) : (
                      comment.authorName
                    )}
                    {!actor.guest && comment.isGuest && " · Guest"}
                    {actor.guest && comment.resolvedAt !== null && <span>· Resolved</span>}
                  </p>
                  <button
                    className={`min-h-11 w-full text-left ${selectedRowClass}`}
                    aria-current={selectedId === comment.id ? "true" : undefined}
                    onClick={() => select(comment)}
                  >
                    <span
                      aria-hidden="true"
                      className="font-semibold tabular-nums underline underline-offset-4"
                    >
                      {frameTime(comment.timecodeMs, frameRate)}
                    </span>
                    <span className="sr-only">
                      {spokenFrameTime(comment.timecodeMs, frameRate)}{" "}
                    </span>{" "}
                    {comment.body && <span className="ml-2">{comment.body}</span>}
                    {comment.drawing && (
                      <span className="ml-2 inline-flex align-middle" title="Includes a drawing">
                        <Pencil className="size-4" aria-hidden />
                        <span className="sr-only">Includes a drawing</span>
                      </span>
                    )}
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
                </CommentList.Content>
                {actor.resolve && !resolved && (
                  <CommentList.Action
                    value={comment.id}
                    className="absolute inset-y-0 start-0 flex items-center bg-success px-4 text-sm font-medium text-white"
                    aria-label={`Resolve ${at}`}
                    disabled={pending}
                  >
                    Resolve
                  </CommentList.Action>
                )}
              </CommentList.Row>
            );
          })}
        </CommentList.Root>
      )}
    </section>
  );
}
