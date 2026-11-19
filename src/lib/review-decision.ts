import { announce, definePrimitive } from "@ui-sdk/core";

export type ReviewDecision = "approve" | "requestChanges";

export type ReviewDecisionOptions = {
  /** Decisions that are not available now, such as Approve on a Video already done. */
  disabled?: ReviewDecision[];
  onDecide?: (decision: ReviewDecision) => void;
};

const spoken = { approve: "Approving", requestChanges: "Requesting changes" } as const;

/**
 * The Owner's or Editor's decision on a Video. The buttons and an agent both go through
 * `approve` and `requestChanges`, so a refused decision is refused the same way for both.
 */
export const reviewDecision = definePrimitive({
  name: "review-decision",
  options: { disabled: "value", onDecide: "callback" },
  state: (_options: ReviewDecisionOptions) => ({}),
  api: (context) => {
    const decide = (decision: ReviewDecision) => {
      if (context.options().disabled?.includes(decision)) return false;
      context.options().onDecide?.(decision);
      announce(`${spoken[decision]}.`);
      return true;
    };
    return {
      approve: () => decide("approve"),
      requestChanges: () => decide("requestChanges"),
    };
  },
  slots: (slot) => ({ root: slot({}) }),
  agent: { actions: ["approve", "requestChanges"] },
});
