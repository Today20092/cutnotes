import { createAgent, registerTools } from "@ui-sdk/react/agent";

/** The ui-sdk agent bridge: reads and operates every ui-sdk component on the page. Dev only. */
export const agent = createAgent();

// A browser with WebMCP (document.modelContext) gets snapshot, act and query as tools.
// Deleting a note needs the person's confirmation; everything else may run.
registerTools(agent, {
  allow: (step) =>
    step.confirm || step.action === "remove"
      ? window.confirm(`Let the browser agent ${step.action} ${String(step.args?.[0] ?? "")}?`)
      : true,
});

declare global {
  interface Window {
    __cutnotesAgent?: typeof agent;
  }
}
window.__cutnotesAgent = agent;
