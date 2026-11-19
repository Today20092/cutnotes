import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { WriteFeedback } from "@/components/project-parts";
import { VideoStatusBadge } from "@/components/video-status";
import { useReviewDecision } from "@/lib/projects";
import type { VideoStatus } from "@/lib/video-status";

/**
 * The only way a Video's Status changes. Request changes sends the Project back to Editing;
 * Approve marks the Video done, and the Project Done once every Video is.
 */
export function ReviewDecisionBar({
  videoId,
  title,
  status,
}: {
  videoId: string;
  title: string;
  status: VideoStatus;
}) {
  const decision = useReviewDecision(videoId);
  const [said, setSaid] = useState("");
  const [failure, setFailure] = useState("");

  function decide(choice: "requestChanges" | "approve") {
    setFailure("");
    decision.mutate(choice, {
      onSuccess: () =>
        setSaid(choice === "approve" ? `${title} is approved` : `Changes requested on ${title}`),
      onError: () => setFailure(`Could not save your decision on ${title}. Try again.`),
    });
  }

  return (
    <section
      aria-label="Review decision"
      className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <VideoStatusBadge status={status} />
      </p>
      <div className="ms-auto flex flex-wrap gap-2">
        <PendingButton
          variant="secondary"
          pending={decision.isPending && decision.variables === "requestChanges"}
          disabled={decision.isPending || status === "rework"}
          onClick={() => decide("requestChanges")}
        >
          Request changes
        </PendingButton>
        <PendingButton
          pending={decision.isPending && decision.variables === "approve"}
          disabled={decision.isPending || status === "done"}
          onClick={() => decide("approve")}
        >
          Approve
        </PendingButton>
      </div>
      <WriteFeedback status={said} failure={failure} />
    </section>
  );
}
