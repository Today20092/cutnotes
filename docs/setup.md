# Set up an install

One install serves one Team. A person or an agent can follow this guide, with one limit: **agents never deploy to production or run `bun run setup`. A human runs those steps.** An agent can prepare the accounts' values with the human and hand over the commands.

## 1. Choose the inputs

| Input | Flag | Notes |
| --- | --- | --- |
| Team name | `--team-name` | Shown in the app |
| Team logo | `--team-logo-url` | Optional. An https image URL |
| First Owner email | `--first-owner-email` | The first sign-in with this verified email becomes the Owner, so nobody else can claim the Team |
| Site origin | `--origin` | https, no path, such as `https://review.example.com` |
| D1 location | `--location` | `weur`, `eeur`, `apac`, `oc`, `wnam` or `enam` |

**D1 has no primary in the Middle East, Africa or South America.** Teams there should choose the nearest location, and should expect slower requests.

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

1. An access token with Mux Video permission: `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`.
2. A signing key: `MUX_SIGNING_KEY_ID`, and its base64 private key as `MUX_SIGNING_PRIVATE_KEY`.
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

It is safe to run again after a failure: it keeps a database already written to the config. Commit the changed `wrangler.jsonc`.

## 6. Deploy (human)

This step is separate from the script, and agents never run it:

```sh
bun run build
bun scripts/node.ts node_modules/wrangler/bin/wrangler.js deploy
```

Attach the site origin's hostname to the Worker as a custom domain in Cloudflare. Then sign in with the first Owner email to create the Owner.
