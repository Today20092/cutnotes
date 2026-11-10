# Git workflow

Work happens on small branches. `development` combines the branches that should be tried together. `main` holds reviewed release source.

## Branches

| Branch | Role |
| --- | --- |
| `main` | Reviewed release source and the default branch on GitHub. |
| `development` | Combined result of the branches chosen for the next release. Test the whole batch here. |
| `integration/cutnotes-v1` | The earlier batch branch, up to ticket 25. `development` started from its last commit. No new work goes here. |
| `ticket/<issue>-<slug>`, `refactor/<slug>`, `fix/<slug>` | One branch per piece of work, with its own worktree under `C:/Users/User/.t3/worktrees/cutnotes/`. |

`main` is the production release branch. `development` is the ongoing integration branch. Keep both synchronized after a release; remove merged task and research branches after preserving their commits.

## Everyday work

1. Start a scoped branch and worktree. Base it on `main` if it can ship alone. Base it on `development` if it depends on work already combined there.
2. Commit on the scoped branch. Run `bun run check` before you merge it.
3. To try it with other work, merge it into `development` with a merge commit (`git merge --no-ff <branch>`). Fix conflicts in the merge commit.
4. Run `bun run check:full` on `development`. A merge can pass on each side and fail together, so this step is not optional.
5. A later change to a merged branch must be merged into `development` again.

## Releasing

- **A batch:** open a pull request from `development` to `main`. Merge it with a merge commit so the history stays visible.
- **One finished feature:** open a pull request from its branch to `main`. It does not need to go through `development` first. Check that the pull request contains only that feature.
- After a fix goes to `main` alone, merge `main` into `development` before the next batch.

## Keeping in step

- `git fetch`, then `git pull --ff-only`. If that fails, the branches have diverged: read both sets of commits and merge on purpose.
- Never force-push `main` or `development`.
- A push is a backup. It does not mean the work is tested or released.

## What runs when

- `.github/workflows/check.yml` runs on pushes to `main` and `integration/**`, and on every pull request. Pushes to `development` also run the check job. A pull request runs it too.
- No workflow deploys. Setup and deploy are manual steps in `docs/setup.md`.

## Cleanup

When a branch is merged, remove its worktree: `git worktree remove <path>`. Check first that it has no uncommitted files and no unmerged commits. Keep `main` and `development`.
