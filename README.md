# Cutnotes

Self-hosted video review for small production teams: upload a cut, watch it on any phone or desktop, and leave timestamped comments and drawings.

Progress is tracked in this repository's issues.

The Member review screen supports timestamped Comments, editing and deleting your own feedback, and To do / Resolved filters. Owners and Editors can Resolve Comments; Owners can delete any Comment. Complete Projects keep feedback readable and refuse changes.

Comments appear immediately, refresh every 30 seconds and on return to the screen, and stay with their Revision. Selecting a Comment or its timeline marker seeks to that moment. Failed sends keep the draft and reuse its browser-generated ID when retried.

Parts of this project will be adapted from [Lawn](https://github.com/pingdotgg/lawn), used under the MIT licence. See `LICENSE.lawn`.

## Project permissions

Projects are private to assigned members and Team Owners. Editors can create their own projects; Owners manage project roles, single-use invitation links, and guest sharing. See [project access and rollout](docs/project-access.md).

## Self-hosting

Follow [docs/setup.md](docs/setup.md).

## Development

For agent branches, combined testing and release promotion, follow [the Git workflow](docs/branch-workflow.md). For staging isolation and production deployment, follow [the setup guide](docs/setup.md).

Requires [Bun](https://bun.sh). Tools that need Node use the pinned binary installed with the dependencies, or Node from PATH.

- `bun install`
- `bun run db:migrate:local`, then `bun run dev`, with values from `.dev.vars.example` in `.dev.vars`
- `bun run check` runs type checks, lint (Oxlint), a format check (Oxfmt; `bun run fmt` fixes it) and the browser-free tests, including Seam 1 (Workers runtime and local D1). `bun run check:full` adds Seam 2 (Playwright at phone and desktop widths). Seam 2's first run needs `bun scripts/node.ts node_modules/@playwright/test/cli.js install chromium`. It serves on port 5199; set `E2E_PORT` to use another.

Clerk's session token must include `email` and `email_verified`, or no first Owner can be created. See `.dev.vars.example`.

The Cloudflare tools are pinned together to `workerd` 1.20261023.1: on Windows, 1.20261101 and 1.20261104 fail to start with `CreateDirectory: Access is denied`. Check for that error before upgrading them.

## Local UI preview without service credentials

Run `bun run dev:preview` and open http://127.0.0.1:5199. Requires `ffmpeg` and `ffprobe` on PATH. The preview automatically signs in as a local test owner. Create a project, then select or drop a browser-playable video. Files stay in `.wrangler/preview-videos`; project data stays in the separate `.wrangler/e2e` local database. Restarting this command preserves both. Running the end-to-end test suite resets that test database.

This explicit Vite preview mode replaces Clerk and Mux locally. Normal development and production retain their existing authentication and media services. It exercises project management, video playback, comments, drawings, and revisions without external accounts. It does not reproduce Mux transcoding, real email invitations, or multi-user authentication. Use an H.264 MP4 for broad browser compatibility; local playback does not transcode. Local frame stepping currently assumes 30 fps.

Validation: typecheck and lint pass; a generated MP4 upload returned HTTP 200 and a 100-byte playback range returned HTTP 206. Full browser flow validation was unavailable because the installed Playwright browser binary is missing.
