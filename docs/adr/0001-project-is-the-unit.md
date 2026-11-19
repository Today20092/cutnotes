# The Project is the unit of access and progress

Status: accepted.

## Context

The model had Folders above Projects. Access came from a Folder or from a Project, and progress was one Status per Video. An Owner could not tell at a glance which Project needed them next, and nobody could see who else had access to a Project. The Folder code (migration, server functions, routes, move UI, invite and share branches) existed only on the `refactor/ui-sdk-trial` branch and had never been deployed.

## Decision

1. **The Project is the unit of access.** The model is Team > Project > Video > Revision > Comment. Folders are removed. People are assigned to a Project as Reviewer, Uploader or Editor, and Team Owners can open every Project. The Project page shows who has access (the People strip), and an Owner changes it in the People sheet.
2. **The Project is the unit of progress.** A Project has one of four **Stages**: New, Editing, In review, Done. The Stage moves by itself: assigning an Uploader or Editor to a New Project moves it to Editing; a Revision becoming ready moves it to In review; **Request changes** moves it back to Editing; approving every Video moves it to Done. An Owner or the Project's Editor can also move it by hand on the home board, with Undo. A Video keeps its own Status (Review, Rework, Done), which changes only through Request changes and Approve. **Complete** (the 14-day deletion countdown) stays a separate, deliberate action.
3. **Customer links are pinned and isolated.** **Send to customer** makes a Share Link for one exact Revision. Its Guest sees only that Revision and the Comments made through the same link: never the Team's Comments, another link's Comments, the Project or the Revision history. Links made before pinning follow the latest Revision.
4. **Agents navigate by URL.** Every sheet, filter, Revision, moment and selected Comment is a validated search param (`validateSearch` with Valibot; an unknown value is dropped, never an error). Opening a URL reproduces the screen, and closing a sheet removes its param. A static `/llms.txt` lists each route template, its params, who can open it and its main actions, with no data. Pages have one `main`, labelled `nav`, one `h1`, labelled board columns, and Project cards as articles named by Project and Stage. The ui-sdk agent bridge (`createAgent`, WebMCP) stays **development-only**. Exposing it in production is an Owner security decision for later.

## Consequences

- Migration `0010` (Folders) was deleted instead of followed by a drop migration, because it never reached an environment. The migrations after it (Stage, pinned Share Links) start clean.
- One mental model for every role: a person sees the Projects they are assigned to, and the Stage each one is in.
- `src/lib/route-index.ts` must change with a route or its search params. `bun run test:structure` fails when it no longer matches the route files.
- Out of scope: client tags, notifications, due dates, custom Stage names, a production agent bridge, URL renames.
