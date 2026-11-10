# Issue #17 implementation handoff

Branch: `implement/issue-17-comments-4d4fc009`.

Started from `integration/cutnotes-v1` at `a5defa21`. Merged current integration at `115a5eaeacecd0e975935078510737c4bd081a4b`, including the other agent's #16 player controls. The final merge check reported `Already up to date`. No migration collisions occurred; the Comments migration is `0003_comments.sql`, generated with Drizzle alongside its snapshot and journal entry.

Implemented #17 against its issue comments, parent spec #8, README and GLOSSARY. Members can create, edit and delete their own timestamped Comments; Owners can delete any Comment; Owners and Editors can Resolve/unresolve. Complete/deleted Projects and deleted Videos refuse writes. Writes validate active membership, ownership, Revision-to-Video binding, body limits and duration. Browser IDs are idempotent, including concurrent retries and lost responses. Author names survive Member removal.

The existing `getReview` read batch includes Comments and caller identity, retaining one `readAsMember` D1 trip per screen, including ready and unavailable states. It returns the selected Revision's full Comment list, replacing deletions during 30-second polling and immediate focus refresh. Optimistic writes share a per-Video mutation scope, restore only the affected Comment on failure, preserve failed send/edit text, and invalidate only after the last pending write. Retry IDs remain stable while the draft is unchanged.

The UI uses existing buttons and layout, To do/Resolved filters, named checkboxes, selected-Comment `aria-current`, and focus restoration after disappearing rows. The #16 player controls are preserved. The only player integration additions are optional seek input and a timeline-marker slot, with fullscreen space for markers. Selecting a Comment pauses the existing shuttle before seeking. Marker buttons remain outside the slider and use visible text glyphs in forced colours.

## Exact final validation

Run after merging integration, on the final implementation tree:

| Command / stage | Result |
| --- | --- |
| `E2E_PORT=5312 bun run check` | Exit 0 |
| TypeScript | Passed |
| ESLint | Passed |
| Player unit tests | 18 passed, 0 failed |
| Seam 1, real Workers runtime + migrated local D1 | 347 passed across 14 files |
| Seam 2, Chromium phone + desktop | 109 passed, 1 skipped, 0 failed; 9.4 minutes |
| `E2E_PORT=5312 bun run build` | Exit 0; client and Worker bundles built |
| `git diff --check` | Passed |

The one skipped browser case is the inherited phone-rotation test on the desktop project; its phone case passed. Comments have 26 focused Seam 1 cases and six browser scenarios at both widths. Browser coverage includes optimistic appearance before an answer, rollback with text retained, lost-answer idempotency, serialization and final-write-only refresh, independent polling/focus deletion propagation, editing, seeking, Resolve/delete focus, Viewer controls, and axe checks in both widths (including light/dark Resolved state). Generic access tests also cover signed-out, non-Member, removed-Member and forged cross-origin calls to every new server function. The one-trip suite includes a ready Revision with a Comment.

TDD red cases were observed before implementation for creation, management, optimistic UI, lost-answer duplication and focus refresh. Earlier incomplete full runs were stopped to incorporate advancing integration or correct the synthetic focus test; the results above are the subsequent complete final run.

Build emitted a non-blocking chunk-size warning: the video-page client chunk is 598.17 kB (187.00 kB gzip). Bundle restructuring was outside this ticket.

## Limitations and coordinator notes for #16

- Chromium automation is not a real iPhone Safari or Android hardware check. Real-device performance, screen readers, native fullscreen and frame-step accuracy remain manual launch checks.
- The inherited Safari fallback calls `webkitEnterFullscreen`. Its orientation-triggered attempt may require a fresh user tap; the explicit Full screen button remains available. Record this limitation on #16; this agent did not edit the issue.
- Verify custom HTML controls, Comment markers and future Drawing overlays in iPhone native fullscreen. Their visibility there is not established by the Chromium fullscreen tests; native video fullscreen may exclude the surrounding HTML UI.
- Safari native-HLS error recovery uses a URL probe because its media error does not expose HTTP status. Live Mux expiry/recovery on Safari was not tested here.
- Drawing and Guest write flows remain in their respective tickets. The Comments schema includes their nullable fields and enforces exactly one author source; a Share Link foreign key belongs with the future Sharing schema.
- The codebase-memory service and coverage-check call both returned `Transport closed`. Structural verification used source fallback. Current TanStack Query mutation-scope and focus-refetch documentation was fetched through Context7.

No deployment, push, PR, issue edits, prototype edits, dependency upgrades or subagents were used.
