import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { createParts } from "@ui-sdk/react/primitive";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { CommentActor } from "@/components/comments";
import { timeLabel } from "@/components/comments";
import { Button } from "@/components/ui/button";
import type { Comment } from "@/lib/review";
import { reviewQueue, type QueueNote } from "@/lib/review-queue";

const Queue = createParts(reviewQueue, {
  root: "ul",
  row: "li",
  content: "button",
  actions: "div",
  action: "button",
});

const actionButtonClass =
  "flex h-full items-center gap-2 px-4 focus-visible:outline-2 focus-visible:-outline-offset-4";

const actionClass =
  "absolute inset-y-0 flex items-center text-sm font-medium data-[side=end]:right-0 data-[side=end]:bg-destructive data-[side=end]:text-white data-[side=start]:left-0 data-[side=start]:bg-success data-[side=start]:text-white";

const noteLabel = (comment: Comment) =>
  `${timeLabel(comment.timecodeMs)} ${comment.body || "Drawing"} (${comment.authorName})`;

/** Open Comments as a swipe list: right resolves, left deletes, with Undo for deletes. */
export function ReviewQueue({
  comments,
  actor,
  select,
}: {
  comments: Comment[];
  actor: CommentActor;
  select: (comment: Comment) => void;
}) {
  const help = useId();
  const [undo, setUndo] = useState<{ run: () => void; label: string } | null>(null);
  const [failure, setFailure] = useState("");
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);
  const open = comments.filter((comment) => comment.resolvedAt === null);
  const byId = new Map(open.map((comment) => [comment.id, comment]));
  const notes: QueueNote[] = open.map((comment) => ({
    id: comment.id,
    label: noteLabel(comment),
    removable: !!actor.remove && !!actor.mayRemove?.(comment),
  }));
  if (!actor.resolve) return null;
  const resolve = actor.resolve;

  return (
    <Collapsible
      render={<section aria-labelledby="queue-heading" />}
      className="mt-6 flex flex-col gap-2"
    >
      <h2 id="queue-heading" className="text-lg font-semibold">
        <CollapsibleTrigger className="group flex min-h-11 items-center gap-2 rounded-md focus-visible:outline-2">
          Review queue ({notes.length} open)
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-data-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
      </h2>
      <CollapsiblePanel className="flex flex-col gap-2">
        <p id={help} className="text-sm text-muted-foreground">
          Swipe a note right to resolve it or left to delete it. With a keyboard, use Up and Down to
          move, Right to resolve and Left or Delete to delete.
        </p>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        {undo && (
          <p className="flex items-center gap-2 text-sm">
            Deleted {undo.label}.
            <Button
              variant="outline"
              onClick={() => {
                clearTimeout(undoTimer.current);
                undo.run();
                setUndo(null);
              }}
            >
              Undo
            </Button>
          </p>
        )}
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">No open notes. Everything is resolved.</p>
        )}
        <Queue.Root
          aria-label="Open notes"
          notes={notes}
          className="flex flex-col divide-y overflow-hidden rounded-lg border"
          onResolve={(id) => {
            setFailure("");
            resolve(byId.get(id)!, true).catch(() =>
              setFailure("Could not resolve the note. Try again."),
            );
          }}
          onRemove={(id) => {
            const comment = byId.get(id)!;
            setFailure("");
            clearTimeout(undoTimer.current);
            const run = actor.remove!(comment, () =>
              setFailure("Could not delete the note. Try again."),
            );
            setUndo({ run, label: noteLabel(comment) });
            undoTimer.current = setTimeout(() => setUndo(null), 5000);
          }}
          onAddNote={(timecodeMs, body) => {
            setFailure("");
            actor
              .send({ id: crypto.randomUUID(), body, timecodeMs, drawing: null })
              .catch(() => setFailure("Could not add the note. Try again."));
          }}
        >
          {notes.map((note) => (
            <Queue.Row key={note.id} value={note.id} className="bg-background">
              <Queue.Actions
                id={`${note.id}-start`}
                row={note.id}
                side="start"
                className={actionClass}
              >
                <Queue.Action
                  id={`${note.id}-start-action`}
                  row={note.id}
                  side="start"
                  className={actionButtonClass}
                >
                  <Check aria-hidden className="size-4" /> Resolve
                </Queue.Action>
              </Queue.Actions>
              {note.removable && (
                <Queue.Actions
                  id={`${note.id}-end`}
                  row={note.id}
                  side="end"
                  className={actionClass}
                >
                  <Queue.Action
                    id={`${note.id}-end-action`}
                    row={note.id}
                    side="end"
                    className={actionButtonClass}
                  >
                    Delete <Trash2 aria-hidden className="size-4" />
                  </Queue.Action>
                </Queue.Actions>
              )}
              <Queue.Content
                value={note.id}
                aria-describedby={help}
                onClick={() => select(byId.get(note.id)!)}
                className="relative z-10 flex min-h-14 w-full items-center bg-background px-4 py-3 text-left transition-transform duration-200 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 data-full:font-semibold data-swiping:transition-none motion-reduce:transition-none"
              >
                {note.label}
              </Queue.Content>
            </Queue.Row>
          ))}
        </Queue.Root>
      </CollapsiblePanel>
    </Collapsible>
  );
}
