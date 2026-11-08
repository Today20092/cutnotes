# Mux limits and playback details

Answers [issue #4](https://github.com/Today20092/cutnotes/issues/4). Researched 2026-11-08 from Mux docs and Mux's own source code. No Mux account was used, so nothing here was tested against the live service.

## Short answers

| Question | Answer | Status |
| --- | --- | --- |
| Maximum file size | Mux publishes no limit. Cutnotes should enforce its own 20 GB cap. | **Not confirmed** that 20 GB is accepted; see below |
| Maximum duration | 12 hours per asset. A 1-hour Cut fits easily. | Documented |
| Input formats | "Most" audio and video formats. MP4, MOV, MKV and TS are named as examples. | Documented, no full list exists |
| Signed tokens | RS256 JWT with `sub`, `aud`, `exp`, `kid`. A separate token for each of video, thumbnail and storyboard. | Documented |
| Sign on Workers | Yes. The official SDK signs with Web Crypto and lists Workers as supported. | Documented; not run by us |
| Pay-as-you-go | Add a credit card. No minimum spend. $20 monthly credit. | Documented, with gaps below |

## File size and duration

- **Duration:** "The max duration for any single asset is 12 hours." ([Minimize processing time](https://www.mux.com/docs/guides/minimize-processing-time))
- **File size:** no maximum appears in the [direct upload guide](https://www.mux.com/docs/guides/upload-files-directly), the [create direct upload API reference](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload), or the standard input guide. Mux does not state that there is no limit either.
- **Enforcing our limits:** Mux has no API-side duration cap, so the app must check it before upload ([Optimizing costs](https://www.mux.com/docs/pricing/optimizing-video-costs)). UpChunk has a client-side `maxFileSize` option ([UpChunk README](https://github.com/muxinc/upchunk/blob/main/README.md)). Client-side checks can be bypassed, so re-check duration on the server once the asset is ready.

## Direct upload behaviour

From the [API reference](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload) and [upload guide](https://www.mux.com/docs/guides/upload-files-directly):

- `timeout`: default 3600 s, minimum 60, maximum 604800 (7 days). The URL is marked `timed_out` if no successful upload occurs in time.
- `cors_origin` must be set for browser uploads. Use the app's real origin, not `*`.
- `new_asset_settings.playback_policies` must include `signed`. With no policy the asset has no playback ID and cannot be played.
- `max_resolution_tier` defaults to `1080p`, which matches Cutnotes.
- `passthrough` is a free string of up to 255 characters, useful for carrying our Cut or Revision ID.
- `test: true` creates a test asset: watermarked, 10 seconds, deleted after 24 hours ([Assets API](https://www.mux.com/docs/api-reference/video/assets)).
- Chunks must be multiples of 256 KB (the last may be smaller) and must be sent in order. `308` means continue; `200` or `201` means done.
- UpChunk defaults: 30 MB chunks, 5 attempts per chunk, automatic pause when offline, `pause()` and `resume()` methods ([README](https://github.com/muxinc/upchunk/blob/main/README.md)).
- Creating an upload is a POST: a 20-request bucket refilling at 1 per second, per environment ([API rate limits](https://www.mux.com/docs/core/make-api-requests)). This is ample for one Team.

**Recommendation:** set `timeout` well above 3600. A 20 GB file at 20 Mbps upload takes about 2.2 hours (our arithmetic), so 86400 is a safe default.

## Input formats and processing speed

"Mux supports most audio/video file formats and codecs" ([API reference](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload)). There is no exhaustive list. The old minimum-encoding-requirements page is replaced by [Minimize processing time](https://www.mux.com/docs/guides/minimize-processing-time), which defines "standard input".

Standard input for the 1080p tier:

| Property | Requirement |
| --- | --- |
| Video codec | H.264 or HEVC |
| Audio codec | AAC (mono, stereo or 5.1) |
| GOP | Closed, starting on an IDR frame |
| Colour | 8-bit 4:2:0, or 10-bit 4:2:0 if HEVC; SDR preferred, HDR not fully supported |
| Resolution | Up to 2048x2048 |
| Keyframe interval | Max 20 s (10 s for HEVC) |
| Bitrate | 8 Mbps or below; no single GOP over 16 Mbps |
| Frame rate | 5 to 120 fps (outside this range is standardized to 30 fps) |
| Edit decision lists | Simple only |

Non-standard files are still accepted. Mux transcodes them to a mezzanine first, so ingest is slower, and it sends a `video.asset.non_standard_input_detected` webhook with reasons.

**What this means for Cutnotes:** 8 Mbps for 1 hour is about 3.6 GB. A 20 GB, 1-hour file averages about 44 Mbps (our arithmetic), so large masters will usually be non-standard. They should work but take longer, so the interface needs a clear "processing" state. ProRes and similar editing codecs are not named by Mux and fall under "most formats"; test one before promising support.

## Signed tokens

From [Secure video playback](https://www.mux.com/docs/guides/secure-video-playback):

- RS256 JWT, signed with a Mux signing key (a 2048-bit RSA key pair, separate from API keys; multiple keys allow rotation).
- Claims: `sub` = playback ID, `exp` = expiry in epoch seconds, `kid` = signing key ID, `aud` = `v` (video and captions), `t` (thumbnail), `g` (GIF), `s` (storyboard), `d` (DRM).
- The official SDK writes `kid` into the **claims**, not the JWT header ([jwt.ts](https://github.com/muxinc/mux-node-sdk/blob/master/src/lib/jwt.ts)). Follow this if signing by hand.
- A signed URL may contain only `?token=`. Any option such as `time`, `width` or `max_resolution` goes in the JWT claims.
- `exp` "should always exceed the current-time plus the duration of the video". "All HTTP requests made to access your content past the expiration time are denied."
- To rotate, create the new key and delete the old one only after its URLs have expired.

### In a custom hls.js player

| Resource | URL | `aud` |
| --- | --- | --- |
| HLS | `https://stream.mux.com/{id}.m3u8?token=` | `v` |
| Thumbnail | `https://image.mux.com/{id}/thumbnail.{jpg,png,webp}?token=` | `t` |
| Storyboard image | `https://image.mux.com/{id}/storyboard.{jpg,png,webp}?token=` | `s` |
| Storyboard data | `https://image.mux.com/{id}/storyboard.{vtt,json}?token=` | `s` |

- **HLS:** give hls.js the tokenized manifest URL. Mux's own player adds the token only to the manifest URL and has no per-segment token logic ([playback-core](https://github.com/muxinc/elements/blob/main/packages/playback-core/src/index.ts)).
- **Storyboards:** use `storyboard.json`, which Mux recommends for chromeless players such as hls.js. Add `crossorigin` to the `<video>` element, as Mux advises. A storyboard has 50 tiles under 15 minutes and 100 tiles for longer assets ([Timeline hover previews](https://www.mux.com/docs/guides/create-timeline-hover-previews)).
- **Thumbnails at a given time:** `time` lives in the token, so each distinct frame needs its own token. Mux's player drops `thumbnailTime` when a token is present ([helpers.ts](https://github.com/muxinc/elements/blob/main/packages/mux-player/src/helpers.ts)). Issue one poster token per Cut, and use storyboard tiles for timeline and comment previews.
- **Mobile:** WebVTT previews generally work only in HTML5 browser players; iOS and Android native players are a separate case. A custom web player that draws its own tiles is unaffected.

## Signing on Cloudflare Workers

- `@mux/mux-node` (v16.1.0 at time of reading) has zero runtime dependencies and its README lists Cloudflare Workers as supported ([README](https://github.com/muxinc/mux-node-sdk/blob/master/README.md)).
- Its signer uses only `crypto.subtle` and converts PKCS#1 keys to PKCS#8 itself. Webhook verification also uses `crypto.subtle` ([jwt.ts](https://github.com/muxinc/mux-node-sdk/blob/master/src/lib/jwt.ts), [webhooks.ts](https://github.com/muxinc/mux-node-sdk/blob/master/src/resources/webhooks/webhooks.ts)).
- Workers supports RSASSA-PKCS1-v1_5 signing ([Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)).
- `signPlaybackId` accepts `type: ['video', 'thumbnail', 'storyboard']` and returns all three tokens. The default expiry is 7 days, so set a shorter one.
- `keyFilePath` is not supported in this build. Store the key as a Worker secret and pass it directly.

## Pay-as-you-go

- **Free plan** (no credit card): up to 10 on-demand assets, 100,000 delivery minutes per month, Mux badge on Mux Player ([blog, May 2025](https://www.mux.com/blog/free-plan)). Ten assets is too few for Cutnotes beyond a trial.
- **Upgrade:** adding a credit card gives unlimited assets, keeps the 100,000 free minutes, and adds $20 of monthly usage credit ([blog](https://www.mux.com/blog/free-plan), [changelog](https://www.mux.com/docs/changelog/payg-plan-improvements-may-2025)).
- **Costs at 1080p basic quality** ([Pricing](https://www.mux.com/docs/pricing/video), [Pricing overview](https://www.mux.com/docs/pricing/overview), [mux.com/pricing](https://www.mux.com/pricing)): input free, storage from $0.003 per minute per month, delivery from $0.001 per minute after the free 100,000. Basic is the default for new accounts. Basic storage has a one-month minimum charge, so deleting early does not avoid it.
- A 1-hour Cut costs about $0.18 per month to store at the first-tier rate (our arithmetic). The $20 credit covers about 6,600 stored minutes before delivery.

## Could not confirm

1. **Whether a 20 GB upload is accepted.** No Mux source gives a file size limit, in either direction. Test a real 20 GB file before locking the limit, or ask Mux support.
2. **Whether `timeout` covers only the start of an upload or its completion.** Mux's wording is ambiguous. Setting it high avoids the question.
3. **Whether signed playback works on the Free plan.** No source says either way. Mux says API access and features are the same across plans, which suggests it does. Pay-as-you-go is the safe assumption for production.
4. **Exactly what happens at the Free plan's 10-asset limit.**
5. **What happens when a token expires during playback.** Mux says requests after expiry are denied, but does not say whether segment URLs carry their own validity. Issue tokens that comfortably outlast a review session, and on a 403 fetch a new token and reload the source at the current time.
6. **Whether `storyboard.vtt` or `storyboard.json` embed a token in their image URLs.** Assume not, and request the image with our own `s` token. Verify with a test asset.
7. **Whether ProRes or other editing codecs ingest cleanly.** Mux does not name them.
8. **Whether Workers `importKey` accepts PKCS#8 RSA keys.** The Cloudflare table lists RSA import but does not name key formats, though PKCS#8 is the standard Web Crypto route and the SDK claims Workers support. CPU time per signature on Workers was not measured either; caching the imported key per isolate reduces the cost.
