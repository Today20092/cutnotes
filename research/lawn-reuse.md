# What to reuse from Lawn

Research for [#6](https://github.com/Today20092/cutnotes/issues/6), against the decisions in [#2](https://github.com/Today20092/cutnotes/issues/2).

**Answer:** reuse the player and its small helpers; reuse the ideas, not the code, for everything on the server. Almost all of Lawn's backend is Convex functions, and its video path is built on R2 and public playback, which are the two things Cutnotes does differently. The share-link and invite logic has good security habits worth copying into D1.

Lawn was read at commit `dfd49b4` of the local fork at `lawn-team-review`. Files there show as modified, but a whitespace-insensitive diff of the two sampled (`convex/mux.ts`, `convex/shareLinks.ts`) is empty, so the changes appear to be line endings only. Paths below are relative to that checkout. Lawn is MIT (`LICENSE`, Copyright 2026 Ping Labs); Cutnotes already carries it as `LICENSE.lawn`, which covers anything copied.

## Verdicts

| Area | Files | Verdict | Why |
| --- | --- | --- | --- |
| Shuttle and keyboard shortcuts | `src/components/video-player/shuttle.ts`, `shuttle.test.ts` | Adapt as is, plus one change | No framework or backend ties, and it has tests. `step()` assumes 30 fps (`frameRate = 30`), so pass the real rate. |
| Playback freeze detection | `src/lib/videoPlaybackHealth.ts` + test | Adapt as is | Pure state machine with no dependencies. |
| Player component | `src/components/video-player/VideoPlayer.tsx` (1441 lines) | Adapt with changes | The hls.js setup, scrubbing, markers and source swapping that keeps the position are the valuable part. Remove download and the quality-source config, restyle, add the Drawing layer. |
| Editor layout | `src/components/video-player/VideoEditorLayout.tsx` | Rewrite | 20 lines tied to Lawn's layout. |
| Mux playback helpers | `src/lib/muxPlayback.ts` + tests | Adapt with changes | Keep lazy hls.js loading and `selectMuxPlaybackSource` recovery. URL building must change for signed playback. |
| Original-file playback | `src/lib/dashboardPlaybackSource.ts` | Drop | Originals are not kept, so there is nothing to fall back to while processing. |
| Mux server wrapper | `convex/mux.ts` | Rewrite (small) | Move to a Worker. Lawn's asset-creation call uses a URL and public policy. Its signing helpers are never called. |
| Webhook handling | `convex/muxActions.ts`, `convex/http.ts` | Adapt with changes | Keep the event switch and the lookup order (upload ID, asset ID, passthrough). Rewrite the storage calls. Drop Stripe from `http.ts`. |
| Upload | `src/lib/videoUpload.ts`, `src/lib/uploadResumeDb.ts`, `app/routes/dashboard/-useVideoUploadManager.ts` | Rewrite the transfer; adapt small parts | All multipart and R2 code goes. Keep `createAsyncTaskQueue`, `createFrameCoalescedPublisher` and the shape of the item status list. |
| Upload limits | `src/lib/uploadLimits.ts` | Adapt with changes | Keep `buildFileFingerprint` only if resume is kept. Part-size constants go. |
| Token and hash helpers | `convex/security.ts` | Adapt with changes | `generateOpaqueToken` is plain Web Crypto and runs anywhere. Password hashing is not needed (see below). |
| Share links | `convex/shareLinks.ts`, `convex/shareAccess.ts` | Rewrite, keep the rules | Convex-bound, and the model differs: named links, two permission levels, Guest names, no passwords. |
| Comments | `convex/comments.ts` | Rewrite, keep the rules | Comments attach to a Revision, Guests have no account, and Drawings are new. `toThreadedComments` can be copied. |
| Roles | `convex/auth.ts` | Rewrite, keep the pattern | `require…Access` with a role rank is right. Four roles and multi-team lookups collapse to three roles and one Team. |
| Invites | `convex/teams.ts:209-340` | Rewrite | Lawn binds an invite to an email; Cutnotes hands a link to whoever has it. |
| Schema | `convex/schema.ts` | Rewrite | D1 tables. `workflowStatus` (review, rework, done) matches. Lawn stacks versions on the `videos` table; Cutnotes has a separate Revision. |
| Scheduled jobs | `convex/crons.ts` | Rewrite | Cron Triggers. Keep the idea of a Mux reconcile sweep. |

## What must be different

### Signed playback

Lawn does not use signed playback. Assets are created with `playback_policies: ["public"]` (`convex/mux.ts:61`), and `ensurePublicPlaybackId` (`convex/videoActions.ts`) creates a public ID when one is missing. `signPlaybackToken` and `signThumbnailToken` exist in `convex/mux.ts:116-137` but nothing calls them. Treat that code as untested.

Three things in Lawn would break or leak if carried over:

- **Query parameters.** `buildMuxPlaybackUrl` adds `max_resolution` next to `token`, and `buildMuxThumbnailUrl` keeps `?time=0` next to `token` (`convex/mux.ts:100-114`). Mux says a signed URL should carry only `token`, with options inside the JWT claims ([secure playback](https://www.mux.com/docs/guides/secure-video-playback), [resolution](https://www.mux.com/docs/guides/control-playback-resolution)). In `@mux/mux-node` these go in the `params` option (`util/jwt-types.d.ts:57`).
- **The 720p cap.** Lawn caps at 720p; Cutnotes streams to 1080p. Set `max_resolution` to 1080p in the claims or leave it out.
- **Playback ID choice.** `getPreferredPlaybackId` prefers public IDs (`convex/muxActions.ts:52`). Cutnotes should accept only `signed`, and create assets with no public ID.

Other consequences:

- **Do not store poster URLs.** Lawn saves `thumbnailUrl` on the video row. A signed URL expires, so store the playback ID and sign when the page is requested. Mux needs separate tokens per kind: `v` video, `t` thumbnail, `s` storyboard.
- **Signing stays on the Worker.** Every token request re-checks Member or Share Link access first.
- **Expiry is a real trade-off.** Mux says a URL stops working at `exp` even mid-playback, and advises `exp` beyond the video's duration. Reviewers pause a lot, so a duration-based expiry can still lapse. Proposal for the spec: `exp` of about duration plus 15 minutes, with a one-hour floor, and on a playback error fetch a fresh token and swap the source at the same position. Lawn's `MuxPlaybackRecovery` and `sourceRevision` already do that swap.
- **Revoking a Share Link is not instant for video.** A token already issued keeps working until `exp`, because Mux does not know about the revocation. Comments and new tokens stop at once. Keeping `exp` short limits this; the spec should state it.
- **Manifest prefetch changes.** `prefetchMuxPlaybackManifest` relies on one stable URL per playback ID, and `muxPlaybackServerContract.test.ts` pins that. Tokens change the URL, so prefetch needs the token already in hand, or goes.
- **No token in logs.** Lawn logs playback IDs in webhooks, which is harmless, but signed URLs must not be logged.

### Direct-to-Mux upload

Lawn uploads to R2 and then has Mux pull from a URL (`createMuxAssetFromInputUrl`). Cutnotes:

1. The browser asks the Worker to start an upload. The Worker checks the Role is Editor or Owner, creates the Revision row, and calls `POST /video/v1/uploads`.
2. Settings: `cors_origin` set to the site's exact origin; `new_asset_settings` with `playback_policies: ["signed"]`, `video_quality: "basic"`, `max_resolution_tier: "1080p"`, and `passthrough` set to the Revision ID (255-character limit). `timeout` defaults to 3600 seconds and allows up to 604800, so set it long enough for slow phones ([API](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload)).
3. The browser sends the file with [UpChunk](https://github.com/muxinc/upchunk) (latest v3.5.0), which handles chunks, retries, and automatic pause while offline. Chunks must be multiples of 256 KB ([Mux](https://www.mux.com/docs/guides/upload-files-directly)). UpChunk's default is 30 MB; test a smaller size, or `dynamicChunkSize`, on real phones.

**Resume limit.** UpChunk's README documents pause and resume within a running page, not after a reload. Lawn's IndexedDB resume is built for S3 part numbers and does not transfer. Proposal for version one: no resume after reload, and a leave-page warning, since the recommended 1080p H.264 MP4 files are modest. Mux's protocol is resumable in principle, so this can be added later.

**Also new:** Lawn never handles `video.upload.asset_created`, because it has no direct uploads. Cutnotes needs it to link the upload to its asset, or can rely on `passthrough` from `video.asset.created`.

**No originals.** Drop `getDownloadUrl`, `allowDownload` and the processing-time playback of the original. Between upload and `video.asset.ready`, show a processing state.

### Webhooks on a Worker

- Verify against the raw body before parsing, as Lawn does. Each webhook endpoint has its own secret, and the SDK default tolerance is 5 minutes ([Mux](https://www.mux.com/docs/core/verify-webhook-signatures), `resources/webhooks.mjs:112`).
- `@mux/mux-node` imports Node's `crypto` for webhook checks, so it would need Workers' Node compatibility. Writing the check on Web Crypto is about 20 lines, and Workers offers `timingSafeEqual` ([Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)). The SDK's JWT path has a `workerd` export using `jose`. Neither was run on Workers for this research.
- Mux retries for 24 hours, times out at 5 seconds, and can send duplicates even after a 2xx ([Mux](https://www.mux.com/docs/core/listen-for-webhooks)). Ordering is not promised, so every handler must be safe to repeat and to receive late.
- **Lawn bug not to copy:** `setMuxAssetReference` (`convex/videos.ts:1517`) sets `status: "processing"` with no guard. A duplicate `video.asset.created` arriving after `ready` moves a finished video back to processing, until the one-minute sweep fixes it. `markAsReady` has the right shape: it checks the current state first. In D1, use conditional updates (`WHERE status = 'processing'`).
- Check that `passthrough` matches a real Revision. Lawn casts it straight to an ID (`convex/muxActions.ts:88`), which is only safe because the signature was checked first.
- Keep a reconcile sweep by Cron Trigger for missed webhooks and abandoned uploads. Lawn runs one every minute.

## Security lessons to carry over

**Keep:**

- Tokens are 32 characters of base62 from `crypto.getRandomValues`, with rejection sampling to avoid bias (`convex/security.ts:9-36`). Roughly 190 bits. Use `generateOpaqueToken` for Share Links and Invites.
- Every access re-checks the link and its video, and the grant call answers identically for a missing, expired or not-ready link (`shareLinks.issueAccessGrant`, `shareAccess.resolveActiveShareGrant`).
- Guests get a reduced comment payload with no user IDs (`toPublicCommentPayload`, `convex/comments.ts:39`). Cutnotes should do the same and never send Clerk IDs to a Guest.
- A reply's parent must belong to the same video (`comments.ts:92`). Extend this to the same Revision.
- Grant tokens are held in React state only, not `localStorage` (`app/routes/-share.tsx:50`).
- Rate limits on public share endpoints, per token and globally (`convex/shareLinks.ts:22`). That Convex component must be replaced, for example with Workers rate limiting.

**Passwords.** #2 gives Share Links no passwords, so none of this is needed. Do not port `hashPassword`. If added later, Lawn's approach is sound (salted PBKDF2, versioned hash, lockout after 5 failures, constant-time compare), but its legacy plaintext `password` column and fallback are not. Check Workers' PBKDF2 limits first, since Lawn uses 210,000 iterations.

**Do differently:**

- **Drop the grant table.** Lawn exchanges the share token for a 24-hour grant, which exists mainly to gate passwords. With no passwords, check the Share Link on each request. It is simpler and revocation is immediate.
- **Guest writes are new risk.** Lawn's `createForShareGrant` requires a signed-in user; Cutnotes Guests are anonymous. Check the link's permission level on the server for every comment and Drawing, cap name and comment lengths (Lawn has no limit on comment text), limit Drawing size and point count, limit writes per link, and validate the timestamp against the duration.
- **Resolve the Revision on the server.** A Guest request names only the link. The Worker picks the latest ready Revision and never trusts a Revision ID from the Guest.
- **Single-use Invites must be atomic.** Lawn's email check is what stops a forwarded link being used by someone else, and Cutnotes has no such check. Consume and create the Member together in one D1 batch, with a conditional delete so two people opening the link at once cannot both join. Store only a SHA-256 hash of the token, since the link is shown once.
- **Share Link storage is a choice.** Lawn stores tokens in plain text and returns them in `list`. A database leak would then expose every link. Hashing prevents that but means a link cannot be copied again later. The share-to-WhatsApp button probably needs re-copying, so the spec should decide; plain text is defensible for one Team if D1 access is tightly held.
- **Check membership on every write.** `comments.update` and `comments.remove` check only authorship for one's own comments, so a removed Member keeps edit rights. A single Worker middleware that loads the Member row fixes this.
- **Keep share URLs out of third parties.** The token is in the path. Send `Referrer-Policy: no-referrer` and `noindex` on share pages.
- **Delete Mux assets when Projects expire.** The 14-day purge has to remove the asset as well as the D1 rows, and retry if Mux fails. `purgeDeletedVideoStorage` is the reference.

## Dropped entirely

Stripe and billing, R2 and S3 code, `convex/search` and the command palette index, presence, folders (`parentId`), multi-team and team slugs, public `watch` pages (`visibility`, `publicId`, `createForPublic`), share-link view counts, and downloads.

## To test on real devices

These come from general knowledge of mobile browsers, not from a source checked here:

- iPhone Safari may not allow fullscreen on a custom element. Lawn calls `requestFullscreen` on a container and silently ignores failure. Native video fullscreen would hide the custom controls and Drawing layer, which matters for "full-screen when sideways".
- Lawn falls back to `video.src` where hls.js is unsupported, which leaves the quality menu empty.
- Frame stepping sets `currentTime` on an HLS stream, so accuracy may vary by browser.

## Sources

Lawn source at commit `dfd49b4`, and `node_modules/@mux/mux-node` 12.8.1 in that checkout. Mux docs: [secure playback](https://www.mux.com/docs/guides/secure-video-playback), [playback resolution](https://www.mux.com/docs/guides/control-playback-resolution), [playback modifiers](https://www.mux.com/docs/guides/modify-playback-behavior), [direct uploads](https://www.mux.com/docs/guides/upload-files-directly), [upload API](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload), [webhook signatures](https://www.mux.com/docs/core/verify-webhook-signatures), [webhooks](https://www.mux.com/docs/core/listen-for-webhooks). [UpChunk README](https://github.com/muxinc/upchunk). [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
