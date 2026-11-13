# Refract native watch-history integration (review preview)

This branch isolates the Refract watched-history prototype from experimental BatCave work. It was branched from `beta-branch`; it does not contain the BatCave cookie/WebView changes or build workflows.

## Status — 2026-11-13

- **Implemented, but not live-tested:** Settings → Trackers → Refract personal API-key connection, an opt-in completed-watch toggle, a persistent retry queue, a status counter, and replay-protected Harbor → Refract writes for movies and episodes.
- Harbor marks watched on playback completion using its existing ~85% rule; Refract jobs are created from the existing watch-events path, including supported manual marks.
- External IDs must match IMDb, TMDB, or TheTVDB. No title guessing. Episodes are matched to Refract's TMDB numbering through its documented `/v1/search/{id_type}/{id}` endpoint.
- **Improved in this branch:** A watched episode is sent with its actual timestamp (`watched_at`), preserving dates when an offline retry happens later.
- **Not implemented:** automatic Refract → Harbor inbound library/watched-state sync, show/episode rewatch logging, OAuth account linking, or a Refract-branded Stremio addon.
- No media is streamed by Refract; this is a tracker integration.

## Official API contract (verified in public docs, not against a member account)

- Base: `https://getrefract.app/v1`
- Key verification: `GET /me` → `profile:read`
- ID resolution: `GET /search/{id_type}/{id}` → `library:read`
- Episode first watch: `PUT /history/episodes/{show_id}/{season}/{number}` → `history:write`. The body may contain `watched_at`; repeating a PUT does not add another watch.
- Movie play: `POST /history/movies` → `history:write`, with a stable `Idempotency-Key` per viewing. Refract holds keys for 24 hours and deduplicates same-viewing reports within 30 minutes.
- Rate limit: 120 requests per minute per credential; obey `Retry-After` on 429.
- Source pages:
  - https://getrefract.app/developers/authentication
  - https://getrefract.app/developers/search
  - https://getrefract.app/developers/writing
  - https://getrefract.app/developers/rate-limits
  - https://getrefract.app/developers/sync

## Connection instructions for a test build

1. In Refract → Integrations → Access and connected apps, **revoke any previously exposed key** and generate a new one with exactly `profile:read`, `library:read`, `history:write`.
2. In a deliberately built desktop Harbor preview, visit Settings → Trackers → Refract; paste the fresh key. Never send the key in a chat, issue, screenshot or commit.
3. Confirm the displayed Refract account name, and the enabled tracking toggle.
4. Test one known movie and one known show episode in TMDB numbering. Mark each watched in Harbor; confirm Refract's diary dates and that no duplicates appear.
5. Test a disconnection/offline retry, a watch while paused before the 85% threshold, an anime with alternate absolute numbering, an unknown external ID, and an account change.
6. Check the counter and unmatched diagnostics, without exposing tokens in logs.
7. Only after passing tests, plan the production integration and onboarding.

## Next phase: real two-way sync

Refract officially supplies `GET /v1/changes/head`, `GET /v1/library`, `GET /v1/history/episodes`, `GET /v1/history/movies`, and `GET /v1/changes?cursor=…`.

For a proper Refract → Harbor importer:
1. Take `/changes/head` **before** the first paginated snapshot.
2. Build an external-ID-indexed cache of library and watched state, applying subsequent `/changes` pages idempotently, storing `next_cursor` only after each page applies successfully.
3. Match show/movie IDs by type and use correct TMDB season/episode numbering. Avoid overriding Harbor's partial resume position.
4. Avoid conflict loops by recording the origin of each watch event, and do not translate Refract deletes to local destructive operations without explicit user consent.
5. On 410/`SYNC_RESET_REQUIRED`, rebuild the local Refract snapshot.
6. Offer **manual preview first**, then opt-in scheduled inbound synchronization; do not silently mark an entire Harbor library watched on connection.
7. Eventually replace personal keys with a Refract OAuth 2.1 public-client device/PKCE flow (requires app registration, consent scopes and safe refresh-token rotation).

**Safety constraints:** This prototype is off production, must not trigger recurring MSI builds, must not merge before targeted TypeScript/Rust checks and real member API testing. Keep other Harbor trackers working and do not mix BatCave changes into this PR.
