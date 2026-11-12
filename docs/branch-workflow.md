# Git workflow

A branch holds source code. An environment is a running install with its own data and service connections. A merge changes source; a deployment changes the running install.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Production: each passing push automatically deploys the exact commit. |
| `development` | Selected work combined for the next release and shared staging review. |
| `ticket/<issue>-<slug>`, `refactor/<slug>`, `fix/<slug>` | One task per branch, with a separate worktree for each agent. |
| `integration/cutnotes-v1` | Retired batch branch. Preserve unfinished work before moving it to a scoped branch. |

## Work and integration

1. Inspect the current branch, worktrees and uncommitted files; fetch remote state before choosing a base. Preserve existing edits. Base independent work on current `main`; base dependent work on `development`. Use the host's worktree tools when available.
2. Make the scoped change. Run focused tests while editing and `bun run check` before proposing integration. Report the commit and check results.
3. Open a pull request to `development` for work in the batch. Review the actual diff and passing checks before merging. Use a merge commit to preserve ancestry. Merge later task revisions again when they are ready.
4. Run `bun run check:full` on the combined batch before treating it as a release candidate. Record the tested commit. A check on an individual task branch does not verify the combined result.

Completion: the intended tasks are present in the candidate, its full suite passes, and the tested commit is recorded. New commits require checks appropriate to their changes and a fresh release-candidate verification.

## Promotion

- **Batch:** open a `development` → `main` pull request. Review the release diff, staging results and migration plan. Merge with a merge commit after the full suite and required checks pass.
- **Independent feature or urgent fix:** a scoped branch may target `main` directly if its diff contains only the intended release. Run `bun run check:full` before promotion. Verify real-service changes on an isolated staging install first.
- **Synchronization:** merge `main` back into `development` after a release or main-only fix, before the next batch. Use `git pull --ff-only` when a branch can advance without divergence; inspect and deliberately merge divergent histories. Never force-push `main` or `development`.

Merging to `main` is the release decision: after Check passes, Actions automatically deploys that exact commit to production. No second deployment request or approval is required. Deployment follows [the setup and release guide](setup.md#release-an-existing-install); record the deployed commit and Worker version. A failed Check or deployment means production has not advanced successfully.

## Repository controls and deployment

Both branches require a pull request, the passing `check` job, an up-to-date candidate and resolved conversations. Rules apply to administrators; force pushes and branch deletion are blocked. There is one collaborator, so a second PR approval is not required. The `production` environment permits only `main` deployments and has no required deployment reviewer, as requested by the owner on 2026-11-12.

`.github/workflows/check.yml` checks pushes to `development` and `main`, including the full browser suite on those branches and PRs into `main`. `.github/workflows/deploy.yml` adds these paths once merged to the default branch:

- A successful Check run for a current `main` push automatically deploys production. A current `development` push deploys staging independently; staging setup or deployment failures do not gate production.
- The workflow runs from `main` and checks out the exact passing SHA. A manual Deploy run can retry the current passing commit: select `main` for production or `development` for staging.
- Each deployment checks the branch head, credentials, runtime secret names and generated target, then records a D1 Time Travel bookmark before migrations. A successful `/api/team` response is a basic availability check; the setup guide describes the additional real-service checks.

Production credentials and runtime secrets are configured. Staging resources are provisioned but its Clerk secret key and Mux runtime secrets are still missing, so staging remains a setup placeholder until configured. See [deployment activation](setup.md#activate-github-deployments).

Keep these controls when changing the pipeline:

- Protect `main` and `development`: require pull requests and the actual CI check names, block force pushes and branch deletion, and require the candidate to be current with its target before merging. Require human review for releases to `main`; use an available reviewer or a recorded human release decision if GitHub cannot enforce self-review.
- Run the normal checks, dependency audit and build on pull requests and pushes to `development` and `main`. Verify that the build leaves `src/routeTree.gen.ts` unchanged. Run the full browser suite on combined release candidates and pull requests to `main`.
- Use GitHub Actions as the deployment path. Use staging for real-service checks when available; it is not a separate approval gate for `main`. Serialize deployments per environment so releases cannot overlap.
- Keep separate GitHub `staging` and `production` environments and scoped deployment credentials. Authorize production through the protected merge to `main`, without a second environment approval.
- Deploy only a selected, passing `main` commit to production. Record its SHA and Worker deployment identifier. Use the target environment's Clerk publishable key at build time and its secrets at runtime. CI for untrusted pull requests receives no deployment credentials.

Inspect `.github/workflows/`, GitHub rules and Cloudflare build settings before changing triggers. Keep Actions as the single deployment path per environment so a merge cannot trigger duplicate deployments.

## Cleanup

Retire task branches and worktrees only after their commits are integrated and needed files are preserved. Check for uncommitted files, unmerged commits and ignored credentials or local data before removal. Keep `main` and `development`. Use the host's managed cleanup when it owns the worktree; otherwise use `git worktree remove <path>`.
