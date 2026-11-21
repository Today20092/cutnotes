import { useState } from "react";
import { Bot, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agent } from "@/lib/agent";

type Step = { ref: string; action: string; args?: unknown[] };
type Script = { name: string; steps: () => Step[] | string | Promise<Step[] | string> };

const openQueue: Step = { ref: "Review queue", action: "open" };

const scripts: Script[] = [
  {
    name: "Add a note at 0:05",
    steps: () => [
      openQueue,
      {
        ref: "Open notes",
        action: "addNote",
        args: ["0:05", "Agent note: check the colour here"],
      },
    ],
  },
  {
    name: "Resolve the first open note",
    // Open the queue, then read its notes from a fresh snapshot, as an agent would.
    steps: async () => {
      await agent.act({ steps: [openQueue] });
      const queue = agent.snapshot().find((entry) => entry.label === "Open notes");
      const first = (queue?.items as { value: string }[] | undefined)?.[0];
      return first
        ? [{ ref: "Open notes", action: "resolve", args: [first.value] }]
        : "No open notes on this page.";
    },
  },
  {
    name: "Move the first Project to In review",
    steps: () => {
      const card = document.querySelector(
        '[data-slot="review-board-card"] a:not([aria-hidden])',
      )?.textContent;
      return card
        ? [{ ref: "review-board", action: "setStage", args: [card, "In review"] }]
        : "No Project on this page. Open Projects.";
    },
  },
];

/** Dev-only panel that drives the page through the ui-sdk agent bridge. */
export default function AgentPanel() {
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has("agent"));
  const [output, setOutput] = useState("");
  const [log, setLog] = useState<string[]>([]);

  async function run(script: Script) {
    const started = performance.now();
    const steps = await script.steps();
    if (typeof steps === "string") {
      setLog((lines) => [`${script.name}: ${steps}`, ...lines]);
      return;
    }
    const result = await agent.act({ steps });
    const ms = Math.round(performance.now() - started);
    const bytes = JSON.stringify(result).length;
    setLog((lines) => [
      `${script.name}: ${result.ok ? "ok" : `failed: ${result.error?.message}`} (${steps.length} step, ${ms} ms, ${bytes} B)`,
      ...lines,
    ]);
    setOutput(JSON.stringify(result, null, 2));
  }

  return (
    <div
      data-agent-hidden
      // Bottom-left on a phone, clear of each card's More actions button on the right.
      className="fixed bottom-4 z-50 flex flex-col gap-2 max-md:left-4 max-md:items-start md:right-4 md:items-end"
    >
      {open && (
        <aside
          aria-label="Agent bridge demo"
          className="flex max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] flex-col gap-2 overflow-auto rounded-lg border bg-background p-3 text-sm shadow-lg"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Agent bridge (dev)</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close agent panel"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden />
            </Button>
          </div>
          <p className="text-muted-foreground">
            Runs scripted steps through <code>agent.act()</code>. No model or key: these are the
            calls an LLM would make.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const snapshot = agent.snapshot();
                setOutput(JSON.stringify(snapshot, null, 2));
                setLog((lines) => [
                  `snapshot: ${snapshot.length} components, ${JSON.stringify(snapshot).length} B`,
                  ...lines,
                ]);
              }}
            >
              Read the page
            </Button>
            {scripts.map((script) => (
              <Button key={script.name} variant="secondary" onClick={() => void run(script)}>
                {script.name}
              </Button>
            ))}
          </div>
          <ol aria-label="Agent log" className="flex flex-col gap-1 font-mono text-xs">
            {log.map((line, index) => (
              <li key={`${log.length - index}`}>{line}</li>
            ))}
          </ol>
          {output && (
            <pre
              aria-label="Agent output"
              className="max-h-80 overflow-auto rounded bg-muted p-2 font-mono text-xs"
            >
              {output}
            </pre>
          )}
        </aside>
      )}
      <Button aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bot aria-hidden /> Agent
      </Button>
    </div>
  );
}
