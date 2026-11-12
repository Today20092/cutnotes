# Cnippet adoption review — 2026-11-12

Reviewed the [live core catalog](https://ui.cnippet.dev/explore), including all 69 category listings and their variant names. The site advertised 748 core, 154 motion and 136 chart variants. This is a category/variant-name survey plus targeted source/documentation review and rendered inspection; it is not an interaction or accessibility audit of all 1,038 demos. Motion and chart demos were not individually audited.

At the start, Cutnotes had **24 local shared UI modules**: 23 imported directly by app code, with Separator used indirectly. That includes local/shadcn components; the configured cnippet registry does not prove that every existing file originated there. These counts are component families, not example variants. Added six actual cnippet registry modules through the CLI, all used in the app, bringing the total to **30**. No runtime dependencies were added. Item and NativeSelect are local families outside this catalog's category list.

The notification-preferences fieldset from the brief was not installed. Field and Fieldset are now used for real existing forms. No notification settings or switches were invented.

## Changes

- Standardized six existing form surfaces with Field; grouped related radio choices and export options with Fieldset. Kept explicit control IDs, validation, focus recovery and existing submit paths.
- Complete Project uses a warning Banner with its original countdown/reopen behavior. Its description uses foreground text because upstream muted text failed light-mode contrast (4.46:1).
- UploadRow uses determinate Progress, keeping its upload name and percentage. The existing native upload disclosure and transport remain intact.
- Settings uses Frame headers/panels for account information and Team navigation.
- Feedback diagnostics use Collapsible; the existing keyboard feedback browser test now exercises Enter/Space expansion.
- Reused Empty for comments, pending invites, share links and reports; Badge for role/permission/report metadata.

## Catalog fit

| Category | Decision | Cutnotes use or reason |
| --- | --- | --- |
| Accordion | Revisit when needed | Useful if Help/FAQ or grouped settings grows. |
| Alert | Revisit when needed | Possible future consolidation of inline error feedback; preserve live-region semantics. |
| Alert Dialog | Revisit when needed | Current destructive confirmations use responsive Sheet; migrate as a separate interaction change. |
| Autocomplete | Revisit when needed | No current free-text suggestion workflow. |
| Avatar | Already used | Member rows already use Avatar/Fallback. |
| Badge | Already used | Video workflow status; expanded to account roles, feedback kind and share permission. |
| Banner | Added | Complete Project countdown shared by project and review pages. |
| Breadcrumb | Already used | PageBreadcrumb across app routes. |
| Button | Already used | Shared actions and PendingButton; local accessibility customizations preserved. |
| Calendar | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Card | Already used | Project cards on home. |
| Carousel | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Chart | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Checkbox | Already used | Comment resolution and handled-feedback filter. |
| Checkbox Group | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Collapsible | Added | Technical diagnostics on feedback reports, with keyboard test. |
| Color Picker | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Combobox | Revisit when needed | Consider for upload destination only when the project list needs searching. |
| Command | Revisit when needed | Quick project/video navigation if library scale warrants it. |
| Context Menu | Revisit when needed | Optional desktop video actions; current Menu works on touch too. |
| Data Table | Revisit when needed | Consider for a large member/report directory; current responsive lists suit small teams. |
| Date Picker | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Dialog | Revisit when needed | Current forms share responsive Sheet behavior. |
| Drawer | Revisit when needed | Sheet already supplies the phone bottom-sheet interaction. |
| Empty State | Already used | Home/project empty states; expanded to comments, pending invites, share links and feedback. |
| Field | Added | Six form surfaces: project/video names, upload metadata, site feedback, invitation link, sharing and marker export. |
| Fieldset | Added | Invite role, share permissions, feedback category and marker settings. |
| File Upload | Revisit when needed | Dropzone presentation already follows cnippet. Keep current strict one-file rejection, duration checks, focus recovery and queue; adopting upstream would change multi-file-drop semantics. |
| Form | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Frame | Added | Account details and Team navigation in Settings. |
| Group | Already used | Drawing controls. |
| Input | Already used | Names, link fields, uploads and feedback; local accessibility customizations preserved. |
| Input Group | Revisit when needed | Possible copy-link field action grouping; retain current clear phone actions. |
| Kbd | Revisit when needed | Useful for a future visible player keyboard-shortcut reference. |
| Label | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Menu | Already used | Video action menu. |
| Meter | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Navigation Menu | Revisit when needed | Current app navigation has few destinations. |
| Number Field | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Input Otp | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Pagination | Revisit when needed | Only needed once server-side lists are paginated. |
| Popover | Revisit when needed | Potential player settings or shortcut reference when there is real content. |
| Preview Card | Revisit when needed | Possible video hover previews; touch parity and media token lifecycle need design. |
| Progress | Added | Upload queue with existing accessible name/value. |
| Radio Group | Already used | Invite role, sharing permission and feedback kind. |
| Rating | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Resizable | Revisit when needed | Potential desktop review panels; substantial layout/keyboard work. |
| Scroll Area | Revisit when needed | Native scrolling currently works; add only for a specific overflow problem. |
| Select | Already used | Member role picker; NativeSelect is a separate local component. |
| Separator | Already used | Used indirectly by Group, ToggleGroup and Item. |
| Sheet | Already used | Existing responsive action/forms surfaces. |
| Sidebar | Revisit when needed | Current small navigation does not need collapsible sidebar complexity. |
| Skeleton | Already used | Loading screens and lists. |
| Slider | Already used | Playback timeline. |
| Sortable | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Spinner | Already used | PendingButton and video loading. |
| Stepper | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Switch | Revisit when needed | No saved notification preferences exist. Do not add nonfunctional settings from the sample. |
| Table | Revisit when needed | Potential dense desktop administration view; responsive lists already work. |
| Tabs | Revisit when needed | Current review filters are state toggles, navigation uses routes. |
| Tag Input | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Textarea | Already used | Comment and feedback inputs. |
| Time Picker | No current fit | No matching product workflow today; do not add controls solely to increase component count. |
| Timeline | Revisit when needed | Activity history only when backed by real events. |
| Toast | Already used | Status messages and playback comment previews. |
| Toggle | Already used | Player/drawing controls. |
| Toggle Group | Already used | Comment filters, drawing tools and review controls. |
| Toolbar | Revisit when needed | Potential drawing/player toolbar enhancement; current Group already handles shared controls. |
| Tooltip | Already used | Player control hints. |

Full captured core-category variant listings: [catalog snapshot](cnippet-catalog-2026-11-12.json). Text capture contains live demo labels as well as variant titles. Source documentation: [Field](https://ui.cnippet.dev/ui/forms/field), [Fieldset](https://ui.cnippet.dev/ui/forms/fieldset), [Banner](https://ui.cnippet.dev/ui/feedback/banner), [Progress](https://ui.cnippet.dev/ui/feedback/progress), [Frame](https://ui.cnippet.dev/ui/layout/frame), [Collapsible](https://ui.cnippet.dev/ui/data/collapsible).

## Validation

- `bun run check` passed on the isolated UI branch, including all 469 Seam 1 tests.
- 30 focused phone browser tests passed across feedback, invites, projects and uploads. The updated feedback test also passed Enter/Space activation of the diagnostic Collapsible.
- Phone accessibility checks passed invitations, Complete Project/reopen states and Share Links/guest pages in light and dark mode. Fixed the Banner description contrast found by this run.
- Inspected Settings and Invites at 1280px, and Invites at 390px. No horizontal overflow on those evaluated screens. An independent read-only review found no actionable issues in the adoption diff.
- `bun run audit` passed at the configured high-severity threshold. `bun run build` passed and left the generated route tree unchanged.
- Full phone/desktop browser suite results are recorded in the PR evidence.
- The keyboard-feedback browser test waits for the page heading before opening the feedback Sheet, so page-load focus does not race the keyboard activation.
- Real devices and screen readers were not checked. Existing upload transport, limits and permission checks were retained. No deployment was performed.
