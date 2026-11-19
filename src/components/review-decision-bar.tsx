import { createParts } from "@ui-sdk/react/primitive";
import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { WriteFeedback } from "@/components/project-parts";
import { VideoStatusBadge } from "@/components/video-status";
import { useReviewDecision } from "@/lib/projects";
import { reviewDecision } from "@/lib/review-decision";
import type { VideoStatus } from "@/lib/video-status";

const Decision = createParts(reviewDecision, { root: "section" });

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
    <Decision.Root
      aria-label="Review decision"
      disabled={[
        ...(status === "rework" ? (["requestChanges"] as const) : []),
        ...(status === "done" ? (["approve"] as const) : []),
        ...(decision.isPending ? (["approve", "requestChanges"] as const) : []),
      ]}
      onDecide={decide}
      className="flex flex-wrap items-center gap-2 rounded-card border p-3"
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
    </Decision.Root>
  );
}
