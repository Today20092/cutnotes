# Built interface accessibility audit (#25)

Target: WCAG 2.2 AA, using the approved screen compositions and the [checklist and 23 findings in #3](https://github.com/Today20092/cutnotes/issues/3#issuecomment-6722250519), under [#25](https://github.com/Today20092/cutnotes/issues/25). This is bounded implementation evidence, not a conformance claim. No issue was edited; this report is the local handoff for the issue owner.

## Finding ledger

“Absent” means the mockup defect is not present in the built implementation. “Fixed” includes the inherited, uncommitted audit fixes assessed and retained on this branch.

| ID | Result | Built implementation / regression evidence |
| --- | --- | --- |
| C1 | Absent | Native playback range supports keyboard seeking, Home/End and exposes its value; player keyboard/frame tests. |
| C2 | Fixed | Document scrolls; player unpins at short heights and while Comments have focus on narrow layouts. Composer scrolls with feedback instead of covering it. Narrow/short/enlarged-text regression. |
| C3 | Absent | Share has visible text at phone and desktop widths. |
| S1 | Fixed | Solid focus tokens; white focus on the black player, explicit system-colour outline in forced colours. Keyboard regression and extended tab-stop audit. |
| S2 | Fixed | Heading focus on navigation/Guest entry; focus returns after Drawing removal/finish and Comment removal/edit. Existing popup and removal tests retained. |
| S3 | Fixed | Native range, visible marker borders/shapes, text checkmarks, selected underlines/borders and system-colour focus survive forced colours. |
| S4 | Absent | Resolve uses a labelled native checkbox instead of the faint custom circle. |
| S5 | Absent | No whole-row opacity; selected/resolved Comments retain ordinary foreground text. Light/dark axe and rendered-colour checks. |
| S6 | Fixed | Selected Comment exposes aria-current, a solid side border and stronger text weight. |
| S7 | Absent | Named colours and tools expose aria-pressed and a visible text checkmark. |
| S8 | Fixed | Polite status for Member/Guest sends and edit/delete/resolve; Share already announces copy/create/revoke. |
| S9 | Absent | Markers are siblings of the native range; value text includes units; player and playback have names. |
| M1 | Fixed | Single main and heading, including Member loading/error states; semantic Comment lists; skip links to content/Comments. Sidebar is a named navigation landmark. |
| M2 | Fixed | Route titles during loading and screen-specific titles when loaded. |
| M3 | Fixed | Visible labels, Guest name autocomplete, Comment field described by its timestamp. |
| M4 | Fixed | Composer and edit field use the input boundary token, checked against rendered light/dark backgrounds. |
| M5 | Absent | To do/Resolved are pressed filter buttons in a named group, not incomplete ARIA tabs. Selected state has an underline. |
| M6 | Fixed | Overlapping markers share a target; every Comment remains independently available in the list. ResizeObserver recalculates grouping using the rendered 1.5rem target width, including enlarged text. |
| M7 | Fixed | Single resolved markers use an outline diamond and include “resolved” in their name. Groups announce their count and lead to the Comment list. |
| M8 | Fixed | Wrapping metadata/headings and filters; responsive/enlarged-text checks cover clipping and overflow. |
| M9 | Absent | User-authored Comment text uses overflow-wrap:anywhere. Long unbroken text included in regression fixtures. |
| M10 | Fixed | Resolve/Edit/Delete names identify author and timestamp. |
| M11 | Fixed | Navigation uses real links with current-page state and a non-colour underline. |

## Scope and method

The normal Seam 2 suite covers signed-out and non-Member screens, Projects, Project, Member review, Members, Invites/Invite acceptance, upload/processing/failure, deletion/completion, Share Links, Guest welcome/review/unavailable, comment editing/resolving, Drawing and playback recovery. It exercises populated, empty, invalid, error, pending, selected and success states where those states exist. External authentication and Mux are represented by the existing local test adapters and silent sample footage.

`e2e/review-accessibility.spec.ts` keeps the focused regressions. `e2e/screens-accessibility.spec.ts` scans states in both themes and attaches axe violations and incomplete results. The JSON reporter retains these attachments in ignored `test-results/results.json`, alongside normal terminal output. The opt-in inherited `e2e/zz-audit.spec.ts` and `zz-audit.config.ts` are retained for repeatable extended audits rather than discarded.

Extended layout modes: 320×568, 390×844, 768×1024, 1280×800, 320×200, 640×400, 740×360 and 390×460. Each receives default text, root font size 200%, and simultaneous line-height 1.5, paragraph spacing 2em, letter spacing .12em and word spacing .16em. Keyboard Tab traversal, both themes, forced colours and reduced motion are included. Screen-reader-only labels reported as clipped by the diagnostic are intentional; they become visible on focus where interactive.

Initial audit exposed covered focus stops, enlarged-text overflow and the sidebar landmark warning; these are not accepted baselines. Focused regressions were run red before their narrow fixes, including missing loading landmarks, repeated live-region messages and marker overlap after text enlargement. The Guest rate-limit screen test now injects an actual HTTP 429 with Start's thrown-response header at the browser/server boundary. It keeps the real successful send/readback, then checks the retry message and retained draft. Seam 1 still exercises the real 30-per-minute limiter. Production rate-limit code and configuration are unchanged.

## Unavailable checks and limits

- NVDA, JAWS, VoiceOver and TalkBack announcements: unavailable. DOM roles, names, states and live-region text are tested; hearing announcements is not claimed.
- Real phones, real touch/soft keyboard and native mobile fullscreen: unavailable. Playwright phone/touch emulation is supporting evidence only.
- Live Clerk and Mux services were not contacted. Seam 2 verifies the application gates and review flows with the existing auth/media adapters, rather than claiming a live vendor-widget audit.
- Actual 400% browser zoom and browser text-only zoom: unavailable in this automated run. 320×200/640×400 are viewport equivalents; 200% root font is explicitly a text-resize approximation.
- Real Windows High Contrast themes, Accessibility Insights guided assessment and representative-user task testing: unavailable. Forced colours and reduced motion are browser emulations.
- Caption/audio-description quality for customer footage and the meaning/contrast of arbitrary Drawings over arbitrary footage cannot be established from the silent fixture. Timestamped text Comments remain the non-drawing path; media authoring requires content-specific review.
- SquirrelScan 0.0.172 baseline and fresh follow-up ran offline/passive, HTTP-only, no publishing/probes, one local signed-out page. Both scored 37/F, accessibility category 94, 84 passed/24 warnings/3 failed. The failures are sitemap, meta description and no H1 in the unhydrated development response. Rendered heading tests pass; an HTTP scan cannot see this client-rendered screen. This is a limited development-SSR site-quality scan, not rendered accessibility evidence or a production score. No sitemap/marketing metadata was added to this private app.

## Executed validation

- Extended matrix: `E2E_PORT=5312 AUDIT_OUT=<absolute test-results/audit.jsonl> AUDIT_SHOTS=<absolute test-results/audit-shots> bun run test:seam2 e2e/zz-audit.spec.ts --config zz-audit.config.ts --project=chromium`: passed, 2.4 minutes including startup. All 144 layout/text modes passed overflow assertions. The 24 keyboard modes contained 956 focus stops with zero obscuring/indicator diagnostics. All 12 axe screen/theme scans had zero violations.
- The extended matrix also completed successfully in Firefox 159 and WebKit 27.2 during the broader audit. Focused responsive/focus/status/selection/marker regressions passed in all three engines: 15 tests, 3.0 minutes. These are supporting cross-browser runs; the final full gate uses Chromium phone and desktop projects, rather than claiming every E2E test ran in every engine.
- Axe incompletes in the extended review/Guest scans: the diamond marker's non-text contrast and visible-name comparison require judgement. Its white/black (or forced system-colour) glyph is paired with an explicit Comment/time/status name; it is not unexplained text. Video-caption checks refer to the silent fixture; live customer media remains a content-specific limitation above.
- Normal state scans also return incomplete `aria-hidden-focus` checks for Base UI's inert background and hidden focus guards. The dialog regression cycles Tab and Shift+Tab through the trap, then verifies Escape restores trigger focus. Incomplete overlapping-background contrast checks on sheets are resolved against the opaque sheet/background and the alpha-composited destructive button; text is asserted at 4.5:1 and focus at 3:1 in both themes.
- Rendered contrast checks use browser-painted colours (including alpha compositing), require at least 3:1 for field/selection/focus boundaries and 4.5:1 for selected text/player controls, and retain their measurements in the normal JSON report. Custom player controls sit on an opaque black surface, with white text/focus, independent of frame brightness.
- Measured composer borders: 4.7417:1 light / 4.1754:1 dark. Selected text and border: 19.7981:1 light / 18.9680:1 dark. Player text: 21:1 in both themes.
- SquirrelScan baseline and follow-up: unchanged limited HTTP results described above.

- Final required gate: `E2E_PORT=5312 bun run check` passed: typecheck, lint, 20 player tests, 439 Seam 1 tests, and 161 Seam 2 tests. Three expected skips: the two opt-in extended matrix projects (run separately above) and desktop's phone-only rotation case. Zero unexpected or flaky results. Seam 2 took 19.3 minutes and retained 176 state/theme axe attachments in `test-results/results.json`.
- `E2E_PORT=5312 bun run build` passed for client and Worker SSR output.
- Latest local `integration/cutnotes-v1` (`8d8ab14d9a3129fef73e7a13aabee187dfa20801`) was merged/confirmed already included before the final gate and checked again afterward. No collisions remained.
- All 23 inherited defect IDs are accounted for as absent or fixed within the executed scope. Manual checks listed above remain unavailable; this does not establish WCAG conformance.

The first full gate hit five-second first-request timeouts while Seam 1 started all Workers in parallel; unfinished requests then contaminated subsequent test state. Repeating unchanged tests with `--maxWorkers=2` passed all 439 tests. Seam 1 now caps workers at two to avoid that cold-start contention, keeping the existing timeout and all production limits unchanged.

The touch-Drawing driver now scrolls the picture into view before capturing viewport coordinates for CDP touch input. The focused phone test passed with the same simplification, cancellation, failed-send preservation and replay assertions; an unpinned picture is not guaranteed to remain under the old viewport coordinates.

Phone reflow checks explicitly exit the intentional rotation-triggered fullscreen player before measuring the document. They verify the fullscreen state and its exit control, then retain all overflow and exposed-composer assertions. The dedicated phone rotation test separately checks entering and leaving fullscreen.

Multi-state axe cases have a 60-second test budget: the desktop Projects case reached its final failed-create state but exhausted 30 seconds after the larger shared fixture set accumulated. Every state/theme scan and assertion remains enabled; the upload-to-ready case also measured 29.3 seconds under the former 30-second budget.
