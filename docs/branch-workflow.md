# Git workflow

A branch holds source code. An environment is a running install with its own data and service connections. A merge changes source; a deployment changes the running install.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Production: each passing push automatically deploys the exact commit. |
| `ticket/<issue>-<slug>`, `refactor/<slug>`, `fix/<slug>`, `chore/<slug>` | One task per branch, with a separate worktree for each agent. |

There is no integration branch. `development` and `integration/cutnotes-v1` are retired; every task goes to `main` through its own pull request.

## Work and release

1. Inspect the current branch, worktrees and uncommitted files; fetch remote state first. Preserve existing edits. Base each task on current `main`. Work in a worktree the host manages: a T3 Code thread on the main checkout moves itself with `t3_worktree_handoff` before editing, and the project's setup script runs `bun install` there. Without a host worktree tool, use `git worktree add` and run `bun install`. Stashes are shared by every worktree, so commit work in progress instead of stashing it.
2. Make the scoped change. Run focused tests while editing, then `bun run check`. Run `bun run check:full` locally when the change touches screens or flows that the browser suite covers. Report the commit and check results.
3. Commit and open a pull request to `main` as the end of every code task, unasked: opening a PR is safe, since only a merge deploys. CI runs `bun run check`, the dependency audit, the build and the full browser suite (phone and desktop) on it. Watch the PR's checks and fix failures until they pass. Review the actual diff and the passing checks.
4. Merge with a merge commit when its checks pass and the user has asked for the merge. To merge without waiting, queue it with auto-merge (`gh pr merge --auto --merge`); GitHub merges once the checks pass.

Several tasks at once: give each its own branch and PR. `main` does not require a PR to be current with it, so each PR merges once its own checks pass, with no "Update branch" round. Check runs again on the merge commit; a failure there blocks the deploy, and the fix goes forward in a new PR. Use `git pull --ff-only` to advance a local `main`; inspect and deliberately merge divergent histories. Never force-push `main`.

Merging to `main` is the release decision: after Check passes, Actions automatically deploys that exact commit to production. No second deployment request or approval is required. Deployment follows [the setup and release guide](setup.md#release-an-existing-install); record the deployed commit and Worker version. A failed Check or deployment means production has not advanced successfully.

Completion: the change is merged to `main`, Check passed on the merge commit, and the deploy succeeded with its commit and Worker version recorded.

## Repository controls and deployment

`main` requires a pull request, the passing `check` job and resolved conversations. It does not require the branch to be current with `main` (owner's choice, 2026-11-21): with an 18-minute browser suite, that rule made each extra PR another full CI round, and the deploy already waits for Check on the merge commit. Rules apply to administrators; force pushes and branch deletion are blocked. There is one collaborator, so a second PR approval is not required. The `production` environment permits only `main` deployments and has no required deployment reviewer, as requested by the owner on 2026-11-12.

`.github/workflows/check.yml` runs on every pull request and on pushes to `main`. The `checks` job runs `bun run check`, the dependency audit and the build; the `browser` job runs the full browser suite on pushes to `main` and on pull requests into `main`; the `check` job requires both. `.github/workflows/deploy.yml`:

- A successful Check run for the current `main` commit automatically deploys production. A run that finishes after a newer commit landed is skipped, not failed; the newer commit's run deploys both.
- Dependabot opens one monthly PR for minor and patch updates and one PR per major update (`.github/dependabot.yml`). `.github/workflows/dependabot-auto-merge.yml` merges the minor and patch PRs after Check passes, runs Check on the merge commit and starts Deploy, because a bot merge creates no push event. A major update needs a person: read its changelog, fix what breaks, then merge.
- Staging deploys only by hand: run Deploy from `main` and choose `staging`. A manual run can also retry production for the current passing `main` commit.
- The workflow checks out the exact passing SHA. Each deployment checks the branch head, credentials, runtime secret names and generated target, then records a D1 Time Travel bookmark before migrations. A successful `/api/team` response is a basic availability check; the setup guide describes the additional real-service checks.

Production credentials and runtime secrets are configured. Staging resources are provisioned but its Clerk secret key and Mux runtime secrets are still missing, so a staging deploy fails until they are configured. See [deployment activation](setup.md#activate-github-deployments).

Keep these controls when changing the pipeline:

- Protect `main`: require pull requests and the actual CI check names, and block force pushes and branch deletion.
- Run the normal checks, dependency audit, build and full browser suite on pull requests into `main` and on pushes to `main`. Verify that the build leaves `src/routeTree.gen.ts` unchanged.
- Use GitHub Actions as the deployment path. Use staging for real-service checks when it is configured; it is not an approval gate for `main`. Serialize deployments per environment so releases cannot overlap.
- Keep separate GitHub `staging` and `production` environments and scoped deployment credentials. Authorize production through the protected merge to `main`, without a second environment approval.
- Deploy only a passing `main` commit. Record its SHA and Worker deployment identifier. Use the target environment's Clerk publishable key at build time and its secrets at runtime. CI for untrusted pull requests receives no deployment credentials.

Inspect `.github/workflows/`, GitHub rules and Cloudflare build settings before changing triggers. Keep Actions as the single deployment path per environment so a merge cannot trigger duplicate deployments.

## Cleanup

Retire task branches and worktrees after their pull request merges and needed files are preserved. Check for uncommitted files, unmerged commits and ignored credentials or local data before removal. Keep `main`. Use the host's managed cleanup when it owns the worktree; otherwise use `git worktree remove <path>`.
