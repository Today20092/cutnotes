import { useEffect, useRef, useState } from "react";
import { Toast } from "@base-ui/react/toast";
import { ToastProvider } from "@/components/ui/toast";
import { playbackComments } from "@/lib/comment-time";
import type { Comment } from "@/lib/review";

/** Timed feedback at the bottom of the screen, with no space in the player layout. */
export function PlaybackComments({
  comments,
  timeMs,
  read,
}: {
  comments: Comment[];
  timeMs: number;
  read: (comment: Comment) => void;
}) {
  const [manager] = useState(() => Toast.createToastManager());
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
    if (toast.current) manager.close(toast.current);
    toast.current = manager.add({
      title: `${comment.authorName} · ${Math.floor(comment.timecodeMs / 60000)}:${String(Math.floor(comment.timecodeMs / 1000) % 60).padStart(2, "0")}${current.length > 1 ? ` · +${current.length - 1} comments` : ""}`,
      description: <span className="line-clamp-2">{comment.body || "Drawing on this frame"}</span>,
      timeout: 5000,
      data: { passive: true },
      actionProps: {
        children: "Read",
        onClick: () => {
          read(comment);
          if (toast.current) manager.close(toast.current);
        },
      },
    });
  }, [comment, current.length, manager, read]);
  useEffect(
    () => () => {
      if (toast.current) manager.close(toast.current);
    },
    [manager],
  );
  return <ToastProvider toastManager={manager} position="bottom-center" />;
}
