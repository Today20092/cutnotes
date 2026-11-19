import { ToneBadge } from "@/components/stage-badge";
import type { VideoStatus } from "@/lib/video-status";

export const statusLabels = { review: "In review", rework: "Changes requested", done: "Approved" };
const statusTone = { review: "in_review", rework: "editing", done: "done" } as const;

/** Read-only: the Status changes only through Request changes and Approve. */
export function VideoStatusBadge({ status }: { status: VideoStatus }) {
  return <ToneBadge tone={statusTone[status]}>{statusLabels[status]}</ToneBadge>;
}
