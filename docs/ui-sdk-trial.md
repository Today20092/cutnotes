# ui-sdk trial

An evaluation of Vercel's ui-sdk (`@ui-sdk/react` and `@ui-sdk/core` `0.1.0-beta.9`, docs at https://ui-sdk.dev/docs) in Cutnotes, on branch `refactor/ui-sdk-trial`. This branch is a trial. It is not a release candidate.

**Verdict: adopt partially.** Use `@ui-sdk/core` for custom interactive behaviors (the swipe queue, the status board) and the agent bridge. Do not merge the full component swap to `main` yet. The [Verdict](#verdict) section gives the reasons.

## What changed

| Area | Change |
| --- | --- |
| Setup | Installed both packages (exact versions). Added the `ui-sdk` agent skill in `.claude/skills/ui-sdk`, an AGENTS.md note that points to the bundled docs, and `@layer ui-sdk;` at the top of `src/styles.css`. |
| Components | Every Base UI wrapper in `src/components/ui/` now uses ui-sdk: button, input, textarea, checkbox, radio group, field, fieldset, avatar, progress, separator, slider, collapsible, toggle, toggle group, tooltip, menu, select, sheet (ui-sdk Dialog) and toast. Badge, breadcrumb, card, group and item use ui-sdk `renderElement`. `@base-ui/react` is removed. Banner, empty, frame, native select, skeleton and spinner never used Base UI and stay as they are. |
| Swipe review queue | `src/lib/review-queue.ts` (primitive) and `src/components/review-queue.tsx`. On a video page, open **Review queue (N open)** below the player. Swipe a note right to resolve it or left to delete it (with Undo). With a keyboard: Up and Down move, Right resolves, Left or Delete deletes. Each result is announced. Built from `createSwipeActions`, `createRovingFocus` and `announce`. |
| Stage board | `src/lib/review-board.ts` and `src/components/stage-board.tsx`, on the home page. Projects sit in New, Editing, In review and Done columns. Drag a card, pick it up with Space and move it with the arrow keys, or use its **Move to…** menu items. Moves are announced, saved through an optimistic Stage write, and can be undone. Columns are plain lists and cards are articles, so a card can hold its link and menu. Built from `createTransfer`, `createChange` and `createRovingFocus`. The order inside a column is local only, because the server stores only the Stage. |
| Agent bridge | `src/lib/agent.ts` calls `createAgent()` and `registerTools()` (WebMCP). A browser that has `document.modelContext` gets `snapshot`, `act` and `query` tools; a delete asks the person first. The bridge exists in development builds only. |
| Agent panel | `src/components/agent-panel.tsx`, the **Agent** button at the bottom right in `bun run dev` and `bun run dev:preview`. **Read the page** shows `agent.snapshot()`. The scripted buttons add a note at 0:05, resolve the first open note and move the first Project to In review, through `agent.act()`. It needs no model and no key. In e2e mode it shows only with `?agent` in the URL. |
| Tests | `e2e/review-queue.spec.ts`, `e2e/review-board.spec.ts` and `e2e/review-agent.spec.ts`. The bridge spec drives the UI only through `agent.act()` and checks the result in the UI. |
| Measurement | `scripts/bundle-size.ts` prints client JS and CSS sizes after `bun run build`. |

The queue, the board and the review decision bar each expose actions to the bridge through the primitive's `agent` key: `resolve`, `remove` and `addNote` on the queue, `setStage` on the board, and `approve` and `requestChanges` on the decision bar (`src/lib/review-decision.ts`). Any app that renders them gets these agent actions without writing a tool schema.

## Agent bridge compared with browser tools

`e2e/review-agent.spec.ts` runs one review task twice on fresh data:

1. Add a note at 0:05.
2. Resolve the note "Lift the shadows".
3. Send the Project back to Editing.

- **Browser-style run:** reads the page as an ARIA snapshot (what browser MCP tools return), then clicks and types, ending with **Request changes**. To set 0:05, it clicks the scrub track by position and corrects with arrow keys until the composer says 0:05.
- **Bridge run:** reads `agent.snapshot()`, then sends `act()` steps that name components by label: open the "Review queue" collapsible, then `addNote` and `resolve` on "Open notes"; then follows the breadcrumb to the home board with a click, because the bridge has no navigation, and calls `setStage` on the board.

Both runs check the result in the UI. "Bytes" is the size of everything the agent reads, as a token proxy (about 4 bytes per token). "Time" is the script's wall time; it doesn't include model thinking time, which scales with calls and tokens.

| Desktop, Chromium | Tool calls | Reads | Actions | Bytes read | Script time |
| --- | --- | --- | --- | --- | --- |
| Browser-style | 12 | 6 | 6 | 12.7 kB | 666 ms |
| ui-sdk bridge, after the full swap | 5 | 2 | 3 | 8.0 kB | 585 ms |
| ui-sdk bridge, before the swap (queue, board and Collapsible only) | 5 | 2 | 3 | 1.2 kB | 505 ms |

On phone the result is the same: 12 against 5 calls. The browser-style script took 5.9 s there, against 0.5 s for the bridge.

- **Calls: 58% fewer**, in both layouts. Each call is a model round trip, so this is the main time saving for a real agent. Vercel's published benchmark reports 17 → 7 calls.
- **Bytes depend on how much of the page is ui-sdk.** With only the custom components on ui-sdk, the bridge read 91% less than the browser-style run. After the full swap, every Button, Toggle and Menu joins the snapshot, and the saving drops to 37%. A full snapshot isn't free. For large pages, use `query()` or narrow what the agent sees with `data-agent-hidden`.
- **A label beats a pixel.** The browser-style run could set a timecode only by clicking a position on the scrub track and correcting with arrow keys. The bridge takes `addNote("0:05", …)`.

Run it with `E2E_PORT=5311 bun run test:seam2 --project=desktop e2e/review-agent.spec.ts`. It writes the numbers and a sample snapshot to `test-results/agent-benchmark.json`.

## Bundle size

From `bun run build`, then `bun scripts/bundle-size.ts`. Client assets only; gzip at level 9.

| Build | JS raw | JS gzip | CSS raw | CSS gzip |
| --- | --- | --- | --- | --- |
| Before (`main`, Base UI) | 1509.5 kB | 511.7 kB | 167.3 kB | 26.6 kB |
| Base UI + ui-sdk queue and board | 1574.4 kB | 537.8 kB | 168.8 kB | 26.8 kB |
| After (all ui-sdk, Base UI removed) | 1588.8 kB | 543.2 kB | 154.4 kB | 24.6 kB |

- The two new features add about 65 kB raw (26 kB gzip). Most of it is the ui-sdk core runtime, which loads with the first page that uses it.
- Replacing Base UI with ui-sdk added 14 kB of JS (5 kB gzip) and removed 14 kB of CSS (2 kB gzip). Removing Base UI didn't make the bundle smaller.
- Net: +6% gzipped JS, including two new features. The agent bridge and panel are not in the production bundle: `import.meta.env.DEV` removes them.

## Accessibility

- **Keyboard everywhere.** The swipe queue has a full keyboard path (Right, Left, Delete, Up and Down) and roving focus with one Tab stop. The board follows the drag-and-drop pattern: Space picks a card up, the arrow keys move it between and within columns, Space drops it and Escape cancels. These come from the core behaviors; the app code only connects them.
- **Announcements included.** `createTransfer` announces each pickup, move and drop with item and column names, for example "Dropped Playback cut in Rework, position 1 of 1.". The queue announces each resolve and delete through `announce`. The specs read the live regions to check them.
- **ARIA from the role.** Slots declare `role`, and the types force the matching `focus`, `press` and `keys`. For example, the board's `option` cards would not compile without a focus strategy.
- **No regressions found by axe.** The existing accessibility specs pass after the swap. The new specs run axe (WCAG 2.2 AA) on the queue and the board.
- **Screen reader caveat.** The arrow-key actions in the queue need focus mode. In browse mode, the regular Comment list keeps its Resolve and Delete controls.

## Rough edges and beta risks

**Release pace.** beta.1 to beta.9 shipped in six days, and the `agent` key and swipe APIs are marked experimental. Pin exact versions and expect breaking changes.

Behavior that broke real interactions in the swap, now fixed or worked around:
- **A closing dialog traps the page.** The page stays inert, with `overflow: hidden`, until the exit transition ends, and clicks in that window are lost. This caused about 10 of the 21 initial e2e failures. Sheets now close without a transition.
- **The toast region blocks clicks.** Its box covered content on phones. It now has `pointer-events: none`, with `auto` on the toasts.
- **An empty live region is always on the page.** ui-sdk keeps an empty `role="alert"` announcer mounted, so every `getByRole("alert")` matches it. Toasts are `<li>` elements and match list locators. The specs use the `appAlert()` and `pageListItem()` helpers in `e2e/support/ui-sdk.ts`.
- **Keyed parts fail silently.** A part with no `value` or `id` prop shares one key with every other part from the same slot, and its `bind` receives the last row's props. In the swipe queue, every row's actions registered under the last row, measured 0 px wide, and the swipe did nothing, with no warning. The fix is an `id` prop. The docs' own example declares it but never says why.
- **Popups render in the top layer, not a portal.** This is good for stacking within ui-sdk, but a remaining Base UI or z-index popup cannot appear above a ui-sdk dialog.

API and docs gaps:
- **Docs contradict themselves.** The "Complete Primitive" example puts `role` in `attrs`; the "Roles, Focus and Keys" section says never to.
- **Many API differences from Base UI:**
  - Select `items` renders the list for you.
  - Menu items need `onSelect`.
  - Slider has no `getAriaValueText` (use `format`).
  - Tooltip has no `data-instant`.
  - The Toast API is renamed: `duration`, `action: { label, onAction }`, `dismiss`.
  - Checkbox callbacks pass `"indeterminate"`.
  - `finalFocus` has no `true`.
- **Wrapper typing is awkward.** `children` can be a function, so six wrappers needed an `Omit`. A function `className` passed through `cn()` typechecks but is silently dropped.
- **Gestures are frame-throttled.** One synthetic pointer jump releases before the last frame, so tests must move in steps. Layout shifts during a drag (for example while the player loads) read as a vertical scroll and cancel the swipe.

Not checked: SSR or hydration console warnings across all screens, a side-by-side visual comparison of the restyled components, and real screen readers (only axe and live-region contents were checked).

## Verdict

**Adopt partially.**

Adopt now:
- **`@ui-sdk/core` for custom behaviors.** The swipe queue and the board take 150 and 110 lines of primitive, and they arrived with the hard parts done: keyboard alternatives to drag, announcements, focus that follows a move and touch handling. Base UI has nothing comparable. Building these by hand would cost far more and would likely miss the announcements.
- **The agent bridge.** It's cheap and absent from production builds. It cut tool calls by 58%, and with only the custom components on ui-sdk it read 91% less. It's the only way an agent can use these custom components by name.

Don't adopt yet:
- **The full component swap.** It brought no visible improvement for users, a slightly larger bundle, and larger agent snapshots. It cost 21 browser test failures, three behavior workarounds (dialog inert window, toast hit area, always-present alert region), and a long list of API differences. Revisit it when ui-sdk reaches 1.0, or once the agent bridge needs to operate the menus, selects and dialogs too.

To adopt partially from this branch, keep the setup, the queue, the board, the agent bridge, the specs and `scripts/bundle-size.ts`. Leave out the merge of `refactor/migrate-ui-sdk-components`. The Collapsibles around the queue and the board can stay on ui-sdk, because they aren't popups.
