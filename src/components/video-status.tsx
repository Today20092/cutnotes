import { Badge } from "@/components/ui/badge";
import type { VideoStatus } from "@/server/db/schema";

export const statusLabels = { review: "Review", rework: "Rework", done: "Done" };
export const statusTone = {
  review: "bg-info/10 text-info-foreground",
  rework: "bg-warning/10 text-warning-foreground",
  done: "bg-success/10 text-success-foreground",
} satisfies Record<VideoStatus, string>;

export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return (
    <Badge variant={status === "done" ? "success" : status === "rework" ? "warning" : "info"}>
      {statusLabels[status]}
    </Badge>
  );
}
