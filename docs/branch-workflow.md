# Git workflow

A branch holds source code. An environment is a running install with its own data and service connections. A merge changes source; a deployment changes the running install.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Reviewed release source and the preferred GitHub default branch. |
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

Deployment follows [the setup and release guide](setup.md#release-an-existing-install). Record the deployed commit separately from the merged commit. An agent may prepare the release; a human controls production deployment.

## Repository controls and deployment

Configured on GitHub on 2026-11-11: both branches require a pull request, the passing `check` job, an up-to-date candidate and resolved conversations. Rules apply to administrators; force pushes and branch deletion are blocked. There is one collaborator, so a second PR approval is not required. The `production` environment requires approval from `Today20092` and permits only `main` deployments.

`.github/workflows/check.yml` checks pushes to `development` and `main`, including the full browser suite on those branches and PRs into `main`. `.github/workflows/deploy.yml` adds these paths once merged to the default branch:

- A successful Check run for a current `development` push requests a staging deployment. The workflow runs from `main` and checks out the exact passing development SHA, so staging permits both `main` (the workflow controller) and `development` (manual runs).
- A manual Deploy run from `development` can retry staging. A manual run from `main` can request production only after confirming staging review and providing a D1 recovery reference. GitHub then waits for the human environment approval.
- Each deployment rechecks the branch head, credentials, runtime secret names and generated target before migrations. A successful `/api/team` response is a basic availability check; the setup guide's real-service review is still required.

Staging resources are provisioned, but the Worker initially serves a 503 setup placeholder. Deployment credentials and Clerk build variables must be supplied before automation can run. Runtime Clerk and Mux secrets must be configured separately. See [deployment activation](setup.md#activate-github-deployments).

Keep these controls when changing the pipeline:

- Protect `main` and `development`: require pull requests and the actual CI check names, block force pushes and branch deletion, and require the candidate to be current with its target before merging. Require human review for releases to `main`; use an available reviewer or a recorded human release decision if GitHub cannot enforce self-review.
- Run the normal checks, dependency audit and build on pull requests and pushes to `development` and `main`. Verify that the build leaves `src/routeTree.gen.ts` unchanged. Run the full browser suite on combined release candidates and pull requests to `main`.
- Use GitHub Actions as the deployment path: deploy a passing `development` commit to staging, then run the real-service checks in the setup guide. Serialize deployments per environment so releases cannot overlap.
- Configure separate GitHub `staging` and `production` environments and scoped deployment credentials. Production deployment requires a human approval step. If the repository plan cannot enforce approval, keep production deployment manual.
- Deploy only a selected, passing `main` commit to production. Record its SHA and Worker deployment identifier. Use the target environment's Clerk publishable key at build time and its secrets at runtime. CI for untrusted pull requests receives no deployment credentials.

Inspect `.github/workflows/`, GitHub rules and Cloudflare build settings before changing triggers. Keep one deployment path per environment so a merge cannot also trigger a second, ungated deployment. Until automation and isolation are verified, use the manual release procedure.

## Cleanup

Retire task branches and worktrees only after their commits are integrated and needed files are preserved. Check for uncommitted files, unmerged commits and ignored credentials or local data before removal. Keep `main` and `development`. Use the host's managed cleanup when it owns the worktree; otherwise use `git worktree remove <path>`.
