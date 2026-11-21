import { Badge } from "@/components/ui/badge";
import type { VideoStatus } from "@/lib/video-status";

const statusLabels = { review: "Review", rework: "Rework", done: "Done" };
const statusTone = {
  review: "bg-violet-500/12 text-violet-800 dark:text-violet-300",
  rework: "bg-rose-500/12 text-rose-800 dark:text-rose-300",
  done: "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300",
};

/** Read-only: the Status changes only through Request changes and Approve. */
export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return (
    <Badge variant="secondary" className={statusTone[status]}>
      {statusLabels[status]}
    </Badge>
  );
}
