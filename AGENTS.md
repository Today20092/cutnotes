# Cutnotes

Self-hosted video review for small production teams. TanStack Start on Cloudflare Workers (D1 with Drizzle), Clerk for auth, Mux for video, Bun for scripts.

- `src/routes/`: pages. `src/server/`: server logic. `src/components/`: UI. `src/auth/`: Clerk wiring.
- `migrations/`: D1 migrations. `scripts/`: setup and Node launcher.
- `test/seam1/`: Seam 1, Vitest in the Workers runtime with local D1. `e2e/`: Seam 2, Playwright. `test/player/` and `test/setup/`: `bun test`.
- Setup, `.dev.vars` and the dev server: see `README.md` (Development). Self-hosting: `docs/setup.md`.

## Boundaries

- Run tools through `bun run <script>`, not `vite`, `vitest` or `playwright` directly: the scripts launch them with the pinned Node via `scripts/node.ts`.
- Never commit or print values from `.dev.vars` (git-ignored; Clerk and Mux keys).
- Never hand-edit `src/routeTree.gen.ts`: TanStack Router regenerates it.
- Do not upgrade the Cloudflare tools (`wrangler`, `workerd`, the Vite and Vitest plugins) without reading the `workerd` pin note in `README.md`.

For branch setup, merging, promotion or cleanup, read [the Git workflow](docs/branch-workflow.md).

## UI components

Use cnippet by default: `npx shadcn@latest add @cnippet/<name>`. Use `@shadcn` only when cnippet has no equivalent. Never overwrite `src/components/ui/button.tsx` or `input.tsx` without checking the diff: they carry local accessibility changes.

## Testing

`bun run check` is the normal check and does not start a browser: it runs typecheck, lint (Oxlint), format check (Oxfmt), `test:player`, `test:setup` and Seam 1. Run `bun run fmt` to fix formatting. CI also runs `bun run audit`. The full browser suite (Seam 2) is slow, so run `bun run check:full` only when the user asks or before a push or PR to `main`. CI runs Seam 2 only for pushes to `main` and PRs into it.

Run one test while working:

- Browser: only the affected specs on one screen size, `bun run test:seam2 --project=phone e2e/members.spec.ts`. Set `E2E_PORT` to avoid a port clash (default 5199).
- Seam 1: `bun run test:seam1 test/seam1/complete.test.ts`.
- Player or setup: `bun test test/player/drawing.test.ts`.

## Agent skills

### Issue tracker

Issues and specs live in this repository's GitHub Issues, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root (`docs/adr/` is created with the first ADR). See `docs/agents/domain.md`.
