# Refract watched-history integration for Harbor (prototype)

**Goal:** Automatically mark movies and individual episodes watched in Refract when a user finishes them in Harbor. Keep the existing Refract Stremio catalog addon; its catalog integration is not a playback scrobbler.

## Motivation

Refract already provides a Stremio addon, but installing the addon in Harbor does not currently push Harbor's completed playback into Refract's history. Harbor already tracks completion locally and supports other watch-history providers. This prototype adds **Harbor → Refract** watched-history writes.

## Current prototype

This branch adds:
- `Settings → Trackers → Refract`: connect with a *personal API key*, enable or disable automatic synchronization, inspect pending and unmatched items, retry, disconnect.
- Movie and episode writes once Harbor considers playback complete (the existing **85%** watched rule).
- Manual movie, episode, season, and show watched-state writes.
- IMDb / TMDB / TVDB lookups through Refract before writing; no fuzzy title matching.
- Persistent bounded retries, per-watch movie idempotency keys, and short-window duplicate suppression.
- A privacy guard so the single personal key only receives the primary Harbor profile's plays.
- Storage of credentials through Harbor's existing desktop secret store rather than source code or a .harborstyle file.

This is **not** full two-way sync: no Refract → Harbor history import, unwatch propagation, backfill, or partial-progress scrobbling.

## Refract API contract (from its public Kodi add-on)

Reference: https://github.com/refracters/refract-kodi/tree/main/service.refract/resources/lib

- `GET /v1/me` — confirm the connected identity
- `GET /v1/search/{imdb|tmdb|tvdb}/{id}?type=movie|episode` — map external IDs to Refract IDs
- `PUT /v1/history/episodes/{show_id}/{season}/{episode}` — mark an episode
- `POST /v1/history/movies` — log a movie with `watched_at`; send a stable `Idempotency-Key` on retries

These requests have known shapes because Refract's official Kodi client uses them with OAuth Bearer tokens. **Whether `rfk_` personal API keys work with Bearer authentication and `GET /v1/me` remains unverified.** The implementation makes no requests until a user explicitly supplies their *own newly issued key*. No key is committed.

## Developer app registration and OAuth proposal

Refract exposes a **Register an app** option and asks developers to configure redirect URLs (one per line). This is different from generating a personal API key.

For a production-quality Harbor integration, OAuth is preferable:
1. Register a dedicated public client for Harbor with Refract (maintained by the actual Harbor maintainers, not tied to a contributor's personal key).
2. Request only `profile:read library:read history:write offline_access` (as used by the published Kodi client, subject to current Refract documentation).
3. Prefer **OAuth Device Authorization Grant** if Refract allows Harbor clients to use it. The official Kodi client already uses `POST /api/auth/device/code`, a verification code, and `POST /api/auth/oauth2/token`. **This flow does not require a browser redirect callback**.
4. If using **Authorization Code + PKCE** instead, register exactly the callback scheme supported by Harbor and Refract. Possible designs are a loopback callback (`http://127.0.0.1:<port>/callback`) or an app deep link (`harbor://...`), but neither should be entered as a real redirect until implementation and provider rules are confirmed.
5. Persist and refresh the user's access/refresh tokens via Harbor's secret store; handle revocation, scope errors, permission minimization, and profile isolation.

**Do not register a redirect URL solely to enable the personal-key prototype.** No OAuth app client ID or callback is implemented in this draft branch.

## Integration points

- `src/views/player/hooks/use-resume-autosave.ts` — completed playback event, verified episode mapping.
- `src/lib/watch-events.ts` — small asynchronous fan-out for completed/watch events.
- `src/lib/media-context-actions.ts` and `src/lib/mark-watched.ts` — manual watched and batch watched actions.
- `src/lib/refract/client.ts` — HTTP client.
- `src/lib/refract/sync.ts` — persistent queue and deduplication.
- `src/views/settings/refract-panel.tsx` — tracker UI.
- `src/lib/secret-store.ts` — protects the key.
- `src/main.tsx` — starts retries only in the main app window.

## Known limitations / review checkpoints

- **Draft, untested against a full Harbor build and live Refract API.** The preceding standalone prototype passed mocked endpoint exercises, but these committed files have not been typechecked against an installed Harbor workspace or tested end-to-end.
- Verify Refract personal token scopes and Bearer acceptance; the `/developers` page was inaccessible to automated review.
- Confirm Refract's expectations for per-episode numbers, anime specials, absolute numbering, multi-episode playback, and rewatch behavior.
- Verify multiple profile handling and account isolation before broad rollout.
- Confirm API CORS / desktop HTTP behavior and security controls for authenticated external requests.
- Add focused tests for identity mapping, retries, manual bulk actions, token loss, and completion event deduplication.
- Evaluate an opt-in initial history backfill, full Refract → Harbor watched-status read, and unwatch semantics only after safe one-way sync.
- Handle any upstream code changes while the PR is under review.

## Local validation checklist

```sh
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm run setup
corepack pnpm tauri dev
```

For testing: create a **fresh limited-permission Refract key**, connect under **Settings → Trackers → Refract**, finish one known movie and one known episode, and verify both in Refract. Test a manual watched action, deliberate rewatch, network outage, and API permission failure. Never publish real credentials or screenshots containing them.

## Security

A previously disclosed key must be revoked and replaced. This branch **does not contain any user's secret**. The prototype is not a production release and is not enabled for users of standard Harbor binaries.

Related sources:
- https://github.com/refracters/refract-kodi
- https://getrefract.app/developers
- https://github.com/Harborofficial/Harbor
