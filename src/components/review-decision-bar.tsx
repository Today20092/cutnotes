import { createParts } from "@ui-sdk/react/primitive";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { VideoStatusBadge } from "@/components/video-status";
import { toast } from "@/components/ui/toast";
import { COMMENT_UNDO_MS } from "@/lib/review";
import { useReviewDecision } from "@/lib/projects";
import { reviewDecision } from "@/lib/review-decision";
import type { VideoStatus } from "@/lib/video-status";

const Decision = createParts(reviewDecision, { root: "section" });

/**
 * The only way a Video's Status changes. Request changes sends the Project back to Editing;
 * Approve marks the Video done, and the Project Done once every Video is. A decision applies to
 * the Revision on screen, so an older Revision says so instead; the page links to the latest.
 */
export function ReviewDecisionBar({
  videoId,
  title,
  status,
  revision,
  latest,
  sendable = false,
}: {
  videoId: string;
  title: string;
  status: VideoStatus;
  /** The Revision on screen. */
  revision: { id: string; number: number };
  /** The newest ready Revision. */
  latest: { id: string; number: number };
  /** An Owner, who is offered Send to customer once the cut is approved. */
  sendable?: boolean;
}) {
  if (revision.id !== latest.id)
    return (
      <section
        aria-label="Review decision"
        className="flex flex-wrap items-center gap-2 pt-3 text-sm text-muted-foreground"
      >
        <p>You're viewing Revision {revision.number}. Decisions apply to the latest cut.</p>
      </section>
    );
  return (
    <DecisionButtons
      videoId={videoId}
      title={title}
      status={status}
      revision={revision}
      sendable={sendable}
    />
  );
}

function DecisionButtons({
  videoId,
  title,
  status,
  revision,
  sendable,
}: {
  videoId: string;
  title: string;
  status: VideoStatus;
  revision: { id: string; number: number };
  sendable: boolean;
}) {
  const { decision, undo } = useReviewDecision(videoId, revision.id);
  const busy = decision.isPending || undo.isPending;
  const [said, setSaid] = useState("");
  const [failure, setFailure] = useState("");

  function decide(choice: "requestChanges" | "approve") {
    setFailure("");
    decision.mutate(choice, {
      onSuccess: ({ decisionId }) => {
        const message =
          choice === "approve" ? `${title} is approved` : `Changes requested on ${title}`;
        setSaid(message);
        toast({
          title: message,
          duration: COMMENT_UNDO_MS,
          action: {
            label: "Undo",
            onAction: async () => {
              try {
                await undo.mutateAsync(decisionId);
                setSaid("Decision undone");
                decision.reset();
                toast({ title: "Decision undone" });
              } catch {
                toast({
                  title: "Could not undo decision",
                  description: "The Video or Project may have changed. Check its current Status.",
                });
              }
            },
          },
        });
      },
      onError: (error) =>
        setFailure(
          error instanceof Response && error.status === 409
            ? `A newer Revision of ${title} is ready. Review it before you decide.`
            : `Could not save your decision on ${title}. Try again.`,
        ),
    });
  }

  return (
    <Decision.Root
      aria-label="Review decision"
      disabled={[
        ...(status === "rework" ? (["requestChanges"] as const) : []),
        ...(status === "done" ? (["approve"] as const) : []),
        ...(busy ? (["approve", "requestChanges"] as const) : []),
      ]}
      onDecide={decide}
      className="flex flex-wrap items-center gap-2 pt-3"
    >
      <p className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <VideoStatusBadge status={status} />
      </p>
      <div className="ms-auto flex flex-wrap gap-2">
        <PendingButton
          variant="secondary"
          pending={decision.isPending && decision.variables === "requestChanges"}
          disabled={busy || status === "rework"}
          onClick={() => decide("requestChanges")}
        >
          Request changes
        </PendingButton>
        <PendingButton
          pending={decision.isPending && decision.variables === "approve"}
          disabled={busy || status === "done"}
          onClick={() => decide("approve")}
        >
          Approve
        </PendingButton>
      </div>
      {sendable && status === "done" && decision.isSuccess && decision.variables === "approve" && (
        <p className="w-full text-sm">
          {title} is approved.{" "}
          <Link
            to="/videos/$videoId"
            params={{ videoId }}
            search={(prev) => ({ ...prev, sheet: "customer", revision: revision.number })}
            replace
            className="font-medium underline underline-offset-4"
          >
            Send to customer
          </Link>
        </p>
      )}
      <p role="status" className="sr-only">
        {said}
      </p>
      {failure && (
        <p role="alert" className="text-sm text-destructive wrap-anywhere">
          {failure}
        </p>
      )}
    </Decision.Root>
  );
}
