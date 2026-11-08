# Cutnotes

Self-hosted video review for small production teams: upload a cut, watch it on any phone or desktop, and leave timestamped comments and drawings.

Early planning. Progress is tracked in this repository's issues.

Parts of this project will be adapted from [Lawn](https://github.com/pingdotgg/lawn), used under the MIT licence. See `LICENSE.lawn`.

## Development

Requires [Bun](https://bun.sh). Tools that need Node use the pinned binary installed with the dependencies, or Node from PATH.

- `bun install`
- `bun run db:migrate:local`, then `bun run dev`, with values from `.dev.vars.example` in `.dev.vars`
- `bun run check` runs type checks, lint, Seam 1 (Workers runtime and local D1) and Seam 2 (Playwright at phone and desktop widths). The first run needs `bun scripts/node.ts node_modules/@playwright/test/cli.js install chromium`. Seam 2 serves on port 5199; set `E2E_PORT` to use another.

Clerk's session token must include `email` and `email_verified`, or no first Owner can be created. See `.dev.vars.example`.

The Cloudflare tools are pinned together to `workerd` 1.20261023.1: on Windows, 1.20261101 and 1.20261104 fail to start with `CreateDirectory: Access is denied`. Check for that error before upgrading them.
