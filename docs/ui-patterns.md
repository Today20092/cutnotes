# Shared UI patterns

The interface is React TSX with TanStack Start, Tailwind CSS, and Base UI/shadcn primitives. Cnippet is the configured community registry. Reuse local components before importing another registry item.

## Existing reusable layers

- `components/ui/`: Button, Card, Badge, Sheet, Menu, Input, Checkbox, RadioGroup, ToggleGroup, Toast, Skeleton, Spinner, and other primitives.
- `AppShell`, `MemberScreen`: navigation, account gating, screen loading and errors.
- `PageHeading`, `PageBreadcrumb`: page headings, focus and navigation.
- `VideoTile`, `VideoCard`, `Poster`: video presentation on the Project page, with image failure fallback.
- `Comments`, `CommentComposer`, `VideoPlayer`, drawing controls: shared member and guest review experiences.
- `ProjectNameSheet`, `DeleteWork`, `UploadSheet`, `WriteFeedback`: repeated editing, confirmation, uploading and feedback interactions.

## Consolidated in this revision

`SettingsLayout` owns the reading width, responsive padding and section spacing for Settings, Members and Invites. Page content remains an input; the layout does not fetch data or enforce permissions.

`PendingButton` composes the existing Button with Cnippet's Spinner. It preserves the action label, marks the button busy and disables repeated activation. An explicit disabled state remains disabled when no operation is pending. Used for comments (including guest comments), invitation/share creation, title saves and permanent deletion. Keep Skeleton for loading page structure; use Spinner for work in progress. Reduced motion freezes the spinner rather than requiring animation to convey state.

`video-status.tsx` owns the workflow labels and semantic colors for the read-only Status badges (the Status changes only through the review decision bar):

| Meaning | Label | Semantic token |
| --- | --- | --- |
| Awaiting review | Review | info / blue |
| Changes required | Rework | warning / amber |
| Review finished | Done | success / green |

Text remains visible, so color is supplementary. Error and destructive feedback retains red. Dark mode uses lighter semantic foregrounds on dark surfaces. Color belongs to the status or outcome, not decorative page sections.

## Project and review components

| Component | Where | What it is for |
| --- | --- | --- |
| `StageBadge` | `stage-badge.tsx` | The Stage as text on a tinted chip: New gray, Editing amber, In review blue, Done green. Video Statuses borrow the same tones through `ToneBadge`. Colour belongs to a Stage or Status, never decoration; red is for failures and destructive actions. |
| `StageBoard` | `stage-board.tsx`, `lib/review-board.ts` | The home board. Four labelled sections (one per Stage) of Project cards, with `?stage=` (one column), `?view=list` (stacked) and `?sheet=complete&project=`. Moves by drag, keyboard or card menu, announced, with Undo. |
| `ProjectCard` | `stage-board.tsx` | One Project as an `<article>` named "Project, Stage": a name link, StageBadge, hint ("Changes requested · Rev N"), open-note count and an AvatarStack. A poster shows only when a Video has one. |
| `AvatarStack` | `people.tsx` | The people with access as overlapping avatars with an accessible list. Owners are left out because they always have access. |
| `PeopleStrip` | `people.tsx` | On the Project page: avatars, names and roles, "Only Team Owners have access" when empty, and **Manage people** (a link to `?sheet=people`) for Owners. |
| `PeopleSheet` | `people-sheet.tsx` | Who can open a Project: one list (Owners implicit, assigned people with a role select and Remove, Pending Invites with Revoke), then **Add from Team** and **Invite link**. |
| `CustomerLinkSheet` | `customer-link-sheet.tsx` | **Send to customer**: a recipient label, View only or Comment and draw, the exact Revision, then Copy or WhatsApp, and the list of links with Revoke. `?sheet=customer`. |
| `ReviewDecisionBar` | `review-decision-bar.tsx`, `lib/review-decision.ts` | **Request changes** and **Approve** with the Video's Status. A ui-sdk primitive, so an agent calls `approve` and `requestChanges` on the same path as the buttons. |
| `ActionMenu` | `action-menu.tsx` | A `⋯` button whose items run at once or open a sheet. The open sheet's id is the URL's `sheet` param, and focus returns to the button when it closes. |

## URL state

Everything that changes what a screen shows is a search param, so a URL reproduces the screen and an agent can navigate without clicking:

- Declare it in the route's `validateSearch` with Valibot, using the helpers in `lib/search-params.ts` (`param`, `sheetParam`, `idParam`, `positiveInt`, `secondsParam`). A missing or unknown value becomes `undefined`; it never throws.
- Open and close a sheet by writing `sheet` (and the ID it is for, such as `video` or `project`) with `navigate({ search: (prev) => ({ ...prev, sheet }), replace: true })`. Closing removes the param. Sheet components take `open` and `onOpenChange` for this, and `ActionMenu` takes `current` and `onCurrentChange`.
- Keep ephemeral input in React state: drafts, hover, the inline title editor and the Site feedback dialog.
- Add a new route and its params to `lib/route-index.ts`. It feeds `/llms.txt`, and `test:structure` checks it against the route files.

## Type scale and layout

`text-title` (page title, 24/28 semibold), `text-section` (17/24 semibold), body 15 to 16, `text-meta` (13/20 muted) and `rounded-card` (12px, used with 16px padding) are utilities in `styles.css`. Use an 8px rhythm. One primary (filled) action per screen: New project on the board, Upload on a Project, Approve on a review. Do not repeat a name the page already shows, such as the Project name on a Video card inside that Project.

## Thumbnails

Production already obtains signed Mux thumbnail URLs. The local preview gateway now supplies local thumbnail URLs instead of fake Mux URLs. The preview serves a cached JPEG extracted from the selected video with FFmpeg. The same Poster component displays both. The generic icon remains the fallback for unavailable, processing, or failed images. The preview requires both `ffmpeg` and `ffprobe` on PATH.

## Verification and limits

Current typecheck and lint pass. The project server suite passed 24 tests. An assert-based render check exercised PendingButton's busy, idle and explicitly disabled states. The local thumbnail endpoint returned HTTP 200 with a valid 640×360 JPEG, and all three browser thumbnails loaded.

Available route states were evaluated at 320 and 1280 CSS pixels in light and dark mode: home, Settings, Members, Invites, project detail, member review, guest review, unavailable share, and already-member invitation outcome. No evaluated state reported axe violations or horizontal overflow. One initial member-review evaluation captured loading; the remaining member-review samples captured the review screen. Media screens still report incomplete caption, contrast and checkbox-name checks that need manual review.

Visual score is provisionally 9/10 (7 of 8 Refactoring UI diagnostic rows supported by the available evidence). The remaining row is full contrast validation across hover, focus, disabled, error and media-overlay states. This is not a conformance score.

Actual mobile hardware, screen readers, production Clerk/Mux, all permission roles, actual browser zoom and every failure state remain outside this local pass. Existing route-review details and scanner limitations are in `docs/reviews/ui-review-2026-11-09.md`.

## Selection-control consistency

`NativeSelect` now owns every native dropdown (video status, member role, upload destination). All share rounded-lg corners, inset chevron, 36px trailing padding, focus treatment, 32px desktop height and 44px phone height. Status color remains supplementary. Native keyboard and platform selection behavior is preserved. Rename, removal and other commands continue to use Button rather than select semantics.

Verified home and Members screenshots at 320px and 1280px: matching control geometry, no horizontal overflow, arrow inset retained. Home, Settings, Members and Invites passed the current desktop axe check with no violations or incomplete results. Standardized stack spacing in member, invitation and share lists. Manual screen-reader and real mobile checks remain outstanding.

## Synchronized playback comments

`PlaybackComments` is shared through Review/VideoPlayer by member and guest screens. It reserves player-owned space so comments do not shift the page or cover the footage. It shows the latest unresolved timestamp for six seconds of video time, groups identical timestamps, preserves the preview while paused, and offers a visibility checkbox and dismissal. Read comment explicitly pauses/seeks and focuses the matching row; automatic updates do not move focus or announce over the video. Native iOS fullscreen may not display custom HTML; that platform behavior remains unverified.

The composer now groups its input, drawing tools and full-width Send Comment action in one card. Checked desktop screenshots, 320px preview overflow and its black background, and the Read comment focus/pause behavior. Timing tests cover pre-comment, grouped timestamps, resolved exclusion, expiry and backward seeking. Typecheck/lint and all three comment-time tests pass. Axe found no violations; media contrast, caption and checkbox-name incomplete results still require manual evaluation. Long text is visually clamped with the complete comment available via Read comment; live multi-comment and long-text visual fixtures were not exhaustively tested.

### Playback feedback revision

The permanent playback-comments area and its checkbox were removed after user review. PlaybackComments now uses the existing Cnippet/Base UI ToastProvider with an isolated toast manager at bottom-center. A reached comment appears briefly (five-second timeout), with a Read action, without reserving player space. Consecutive comments replace the prior toast. The full comment list remains available. The earlier reserved-panel description above is superseded by this revision. Native fullscreen toast visibility remains unverified.
