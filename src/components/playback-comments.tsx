import { useEffect, useRef, useState } from "react";
import { Toasts, createToaster } from "@/components/ui/toast";
import { frameTime, playbackComments } from "@/lib/comment-time";
import type { Comment } from "@/lib/review";

/** Timed feedback at the bottom of the screen, with no space in the player layout. */
export function PlaybackComments({
  comments,
  timeMs,
  frameRate,
  read,
}: {
  comments: Comment[];
  timeMs: number;
  frameRate: number | null;
  read: (comment: Comment) => void;
}) {
  const [manager] = useState(() => createToaster());
  const last = useRef<string | null>(null);
  const toast = useRef<string | undefined>(undefined);
  const current = playbackComments(comments, timeMs);
  const comment = current[0];
  useEffect(() => {
    if (!comment) {
      last.current = null;
      return;
    }
    if (last.current === comment.id) return;
    last.current = comment.id;
    if (toast.current) manager.dismiss(toast.current);
    toast.current = manager({
      title: `${comment.authorName} · ${frameTime(comment.timecodeMs, frameRate)}${current.length > 1 ? ` · +${current.length - 1} comments` : ""}`,
      description: <span className="line-clamp-2">{comment.body || "Drawing on this frame"}</span>,
      duration: 5000,
      data: { passive: true },
      action: { label: "Read", onAction: () => read(comment) },
    });
  }, [comment, current.length, frameRate, manager, read]);
  useEffect(
    () => () => {
      if (toast.current) manager.dismiss(toast.current);
    },
    [manager],
  );
  return <Toasts toaster={manager} side="bottom" align="center" />;
}
