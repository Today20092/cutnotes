# Set up an install

One install serves one Team. A person or an agent can follow this guide, with one limit: **agents never deploy to production or run `bun run setup`. A human runs those steps.** An agent can prepare the accounts' values with the human and hand over the commands.

Use a Cloudflare account on the Workers Paid plan. Install Bun and run commands from the repository root; keep `bun.lock` so installs use the tested runtime versions.

## Environments and service connections

Use [the Git workflow](branch-workflow.md) for branch roles and promotion. Keep three places for work:

| Environment | Purpose | Connections |
| --- | --- | --- |
| Local | Agent edits and automated tests | Local D1. Automated tests use test Clerk tokens and a fake Mux gateway. Ordinary `bun run dev` uses the credentials supplied in `.dev.vars`. |
| Staging | Shared review of the selected `development` commit | Separate Worker, D1 database, Clerk test configuration and Mux environment; sample videos and test Members. |
| Production | The Team's real work, released from `main` | Production Worker, D1 database, Clerk application and Mux environment. |

The Worker serves pages and checks Roles and Share Links. D1 stores Team and review records; it does not store uploaded video. The browser uploads directly to Mux and plays video from Mux. Mux sends signed events to the Worker's `/api/mux/webhook` endpoint. Clerk handles Member sign-in. The hourly Worker task reconciles Revisions and removes work due for deletion.

### Deployment targets

This repository now has explicit [staging](../wrangler.staging.jsonc) and [production](../wrangler.production.jsonc) deployment configs. `wrangler.jsonc` remains the local/self-hosting config used by the setup script. Production retains the existing `cutnotes` Worker and database; staging uses `cutnotes-staging` and a separate database, rate limit namespaces and origin.

The staging database has its six initial migrations applied. The staging Worker is a 503 setup placeholder until its own Clerk and Mux secrets are present. Creating these resources did not change the production deployment.

### Configure isolation before staging deployment

The current setup script handles one root `wrangler.jsonc`; it does not select a named environment. The commands below target that root install. Do not run them as a way to switch an existing production install to staging.

Before enabling shared staging or automated deployment:

1. Review the separate deployment configs, including Worker names, domains, D1 IDs, rate limit namespaces, Team settings and `APP_ORIGIN`. Select the file at build time with `CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH=wrangler.staging.jsonc` or `wrangler.production.jsonc`; verify the generated deployment config targets the same install. The workflow supplies this variable. Keep local tests on the root config.
2. Configure each target's Clerk keys and claims, Mux credentials, signing key and webhook secret. Send each Mux environment's webhook to its own origin. Build with that target's `VITE_CLERK_PUBLISHABLE_KEY`; keep private keys in runtime secrets.
3. For remote migrations and runtime secret commands, pass `--config wrangler.staging.jsonc` or `--config wrangler.production.jsonc` explicitly. Deploy the generated config from a build of that target. Review the resolved Worker, database and origin before any remote mutation. The existing setup script still provisions only the root install; use the explicit configs for these two existing installs.
4. Confirm staging can upload and delete a sample Revision without changing production records or media. Keep production data and credentials out of staging and automated tests.

Completion: both targets resolve to distinct resources, and the staging real-service check below passes. See [Cloudflare Vite configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/api/) for file selection rules.

### Activate GitHub deployments

The GitHub `staging` and `production` environments already exist. Each has `CLOUDFLARE_ACCOUNT_ID` and `APP_ORIGIN` variables. Before enabling the pipeline:

1. Add `CLOUDFLARE_API_TOKEN` as an environment secret for each target, with Workers Scripts Edit and D1 Edit for the configured Cloudflare account. Use separate scoped tokens where possible. Add that target's Clerk publishable key as the `VITE_CLERK_PUBLISHABLE_KEY` environment variable. Keep deployment credentials out of repository files and pull request jobs.
2. Create staging's dedicated Clerk test configuration and Mux environment using sections 2 and 3 below. For each of the eight runtime secret names in `.dev.vars.example`, run the following human command with the staging value:

   ```sh
   bun scripts/node.ts node_modules/wrangler/bin/wrangler.js secret put SECRET_NAME --config wrangler.staging.jsonc
   ```

   Replace `SECRET_NAME` with one actual name at a time. Do not use production values. Existing production runtime secrets stay on the production Worker; supply its matching Clerk publishable key to GitHub for production builds.
3. Merge the workflow and config changes through a reviewed PR. The Deploy workflow must exist on `main` for `workflow_run` and manual dispatch to activate. Then merge the same changes into `development` and let Check verify the combined candidate before staging deploys.
4. Complete the real-service staging review in the release procedure. Production stays manual through Actions → Deploy: select the `main` branch, choose `production`, confirm staging review and enter the recovery reference. Approve the resulting production environment request only for the intended SHA.

Deployment logs include the Worker version/deployment identifiers. The job summary records the source SHA, target origin and supplied recovery reference. A failed availability check requires investigation; it does not automatically reverse migrations.

## 1. Choose the inputs

| Input | Flag | Notes |
| --- | --- | --- |
| Team name | `--team-name` | Shown in the app |
| Team logo | `--team-logo-url` | Optional. An https image URL |
| First Owner email | `--first-owner-email` | The first sign-in with this verified email becomes the Owner, so nobody else can claim the Team |
| Site origin | `--origin` | https, no path, such as `https://review.example.com` |
| D1 location | `--location` | `weur`, `eeur`, `apac`, `oc`, `wnam` or `enam` |

**D1 has no primary in the Middle East, Africa or South America.** Teams there should choose the nearest location, and should expect slower requests.

The location is a placement hint, not a guarantee. A rerun keeps the existing database and does not relocate it.

Team name and logo are kept as one setting each, `TEAM_NAME` and `TEAM_LOGO_URL`, in `wrangler.jsonc`. To change them later, edit those values and deploy.

## 2. Create the Clerk application

Use a Clerk application for this install only. **If another install shares the Clerk account, create a separate application**, so the two never share users or sessions.

1. Enable sign-in with Google and with an emailed code.
2. Customize the session token (Sessions, Customize session token) to include both claims. Without them no first Owner can be created:

   ```json
   {
     "email": "{{user.primary_email_address}}",
     "email_verified": "{{user.email_verified}}"
   }
   ```

3. Note the publishable key, the secret key and the JWT public key (`CLERK_JWT_KEY`).
4. Put the publishable key in `.env` as `VITE_CLERK_PUBLISHABLE_KEY=...`. It is the only value needed at build.

## 3. Create the Mux environment

Use a dedicated environment on a pay-as-you-go plan. **If another install shares the Mux account, create a separate environment**: its assets, tokens, signing keys and webhooks are then its own.

In that environment, create:

1. An access token with Mux Video read and write permissions: `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
2. A signing key in the Mux dashboard: `MUX_SIGNING_KEY_ID`, and its base64 private key as `MUX_SIGNING_PRIVATE_KEY`. Save the private key when it is issued; Mux will not return it again.
3. A webhook endpoint at `<site origin>/api/mux/webhook`. Its signing secret is `MUX_WEBHOOK_SECRET`.

## 4. Check the Wrangler config

`wrangler.jsonc` is complete: `nodejs_compat`, the `DB` D1 binding, the hourly cron and the rate limit bindings. The script fills in the database ID and the setup inputs.

The rate limit bindings need no resource created:

| Binding | Limit |
| --- | --- |
| `SHARE_LINK_COMMENT_LIMIT` | 30 Comment writes per minute per share link |
| `SHARE_ADDRESS_LIMIT` | 300 requests per minute per client address |

If another install shares the Cloudflare account, change the Worker `name`, the `database_name` and both `namespace_id` values first, so the installs stay apart. A `namespace_id` is a number unique within the account.

Leave the Cloudflare tools at their pinned versions. They are pinned together to `workerd` 1.20261023.1, because on Windows 1.20261101 and 1.20261104 fail to start with `CreateDirectory: Access is denied`. Check for that error before upgrading them.

## 5. Run the script (human)

```sh
bun install
bun scripts/node.ts node_modules/wrangler/bin/wrangler.js login
bun run setup --team-name "Example Studio" --team-logo-url "https://example.com/logo.png" --first-owner-email "owner@example.com" --origin "https://review.example.com" --location weur
```

The script:

1. Runs `wrangler d1 create` with the location and writes the database ID into `wrangler.jsonc`.
2. Writes the Team name, logo, site origin and first Owner email into `wrangler.jsonc`.
3. Runs `wrangler secret put` for each Clerk and Mux value. Paste each when asked.
4. Runs `wrangler d1 migrations apply DB --remote`.

It is safe to run again after a failure: it keeps a database already written to the config. If database creation succeeds but writing the config fails, recover that database ID from Wrangler or the dashboard before retrying, to avoid creating another database. Commit the changed `wrangler.jsonc`; never commit `.env`, `.dev.vars` or private keys.

## 6. Deploy (human)

This step is separate from the script, and agents never run it:

```sh
bun run build
bun scripts/node.ts node_modules/wrangler/bin/wrangler.js deploy
```

Attach the site origin's hostname to the Worker as a custom domain in Cloudflare. Then sign in with the first Owner email to create the Owner.

## Release an existing install

1. Select the reviewed release commit using [the promotion rules](branch-workflow.md#promotion). Use a clean release checkout and install from `bun.lock`. Record the commit, check results, target Worker, database and origin. Keep unrelated local work outside the release checkout.
2. Test new migrations on a staging database representing the previous release. Prefer additive changes that allow the previous Worker to keep running; remove old fields in a later release. Before production migration, record a usable D1 recovery point or backup and the recovery procedure. A database restore can discard writes made after that point.
3. Verify the staging candidate with real services: Member sign-in and Role checks; a sample Revision upload; the signed webhook reaching Ready; playback; a Comment; Share Link access and revocation; and deletion of the sample work. Automated browser tests use service replacements and do not prove these connections work. Confirm the hourly cleanup is enabled for the intended install.
4. A human approves the exact production commit and migration plan. For this repository's production install, use the approved GitHub deployment path above. The commands below are only for a separate single-target self-hosted install provisioned by the setup script. Check the target before running them.

   ```sh
   bun run build
   bun scripts/node.ts node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote
   bun scripts/node.ts node_modules/wrangler/bin/wrangler.js deploy
   ```

5. Record the commit and Worker deployment identifier. Check production sign-in, playback and a permitted Comment using designated test work, then inspect Worker errors and webhook delivery failures. Mark the release successful only after these checks pass. Bring main-only changes back into `development`.

### Recover a failed release

Stop further promotion and record the failing commit and symptoms. A human can restore a known working Worker deployment if it is compatible with the current database and bindings. Otherwise prepare a forward fix or follow the recorded database recovery procedure. Verify the service connections again before reopening writes.

A Worker rollback does not reverse D1 migrations or restore videos deleted from Mux. Keep deletion testing on sample work and account for the hourly cleanup during recovery. See [Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
