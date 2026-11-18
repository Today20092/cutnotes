import { createParts } from "@ui-sdk/react/primitive";
import type { TransferLists } from "@ui-sdk/core";
import { useEffect, useId, useRef, useState } from "react";
import { statusLabels, statusTone } from "@/components/video-status";
import { WriteFeedback } from "@/components/project-parts";
import { useSetVideoStatus, type VideoSummary } from "@/lib/projects";
import { videoStatuses, type VideoStatus } from "@/lib/video-status";
import { cn } from "@/lib/utils";
import { reviewBoard } from "@/lib/review-board";

const Board = createParts(reviewBoard, { root: "div", column: "ul", card: "li" });

type Write = (status: VideoStatus) => Promise<unknown>;

/** Owns the Status write for one Video, so each move is optimistic and undone on failure. */
function StatusWriter({ id, writers }: { id: string; writers: Map<string, Write> }) {
  const { mutateAsync } = useSetVideoStatus(id);
  useEffect(() => {
    writers.set(id, (status) => mutateAsync({ videoId: id, status }));
    return () => void writers.delete(id);
  }, [id, writers, mutateAsync]);
  return null;
}

/** Videos as cards in Review, Rework and Done columns. Moving a card changes its Status. */
export function ReviewBoard({ videos }: { videos: VideoSummary[] }) {
  const help = useId();
  const writers = useRef(new Map<string, Write>()).current;
  // Order inside a column is local: the server stores only the Status.
  const [order, setOrder] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const lists: TransferLists = Object.fromEntries(
    videoStatuses.map((column) => [
      column,
      videos
        .filter((video) => video.status === column)
        .map((video) => video.id)
        .sort((a, b) => rank(a) - rank(b)),
    ]),
  );
  const titles = Object.fromEntries(videos.map((video) => [video.id, video.title]));

  function change(next: TransferLists) {
    setOrder(videoStatuses.flatMap((column) => next[column] ?? []));
    setFailure("");
    for (const column of videoStatuses)
      for (const id of next[column] ?? []) {
        const video = videos.find((row) => row.id === id);
        if (!video || video.status === column) continue;
        writers
          .get(id)?.(column)
          .then(() => setStatus(`${video.title} is now ${statusLabels[column]}`))
          .catch(() => setFailure(`Could not move ${video.title}. Try again.`));
      }
  }

  return (
    <section aria-labelledby="board-heading" className="flex flex-col gap-2">
      <h2 id="board-heading" className="text-lg font-semibold">
        Status board
      </h2>
      <p id={help} className="text-sm text-muted-foreground">
        Drag a Video to another column to change its Status. With a keyboard, press Space to pick it
        up, Left and Right to change column, Up and Down to place it, Space to drop and Escape to
        cancel.
      </p>
      <WriteFeedback status={status} failure={failure} />
      {videos.map((video) => (
        <StatusWriter key={video.id} id={video.id} writers={writers} />
      ))}
      <Board.Root
        lists={lists}
        onListsChange={change}
        columns={statusLabels}
        titles={titles}
        className="grid gap-3 sm:grid-cols-3"
      >
        {(state) =>
          videoStatuses.map((column) => (
            <div key={column} className="flex min-w-0 flex-col gap-2 rounded-lg border p-2">
              <h3 id={`board-${column}`} className="px-1 text-sm font-medium">
                {statusLabels[column]}{" "}
                <span className="text-muted-foreground">({state.lists[column]?.length ?? 0})</span>
              </h3>
              <Board.Column
                value={column}
                aria-labelledby={`board-${column}`}
                className="flex min-h-16 flex-col gap-2"
              >
                {(state.lists[column] ?? []).map((id) => (
                  <Board.Card
                    key={id}
                    value={id}
                    aria-describedby={help}
                    className={cn(
                      "cursor-grab touch-none rounded-md border bg-background px-3 py-2 text-sm select-none focus-visible:outline-2 data-grabbed:ring-2 data-grabbed:ring-ring",
                      statusTone[column],
                    )}
                  >
                    {titles[id]}
                  </Board.Card>
                ))}
              </Board.Column>
            </div>
          ))
        }
      </Board.Root>
    </section>
  );
}
