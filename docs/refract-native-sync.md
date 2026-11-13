# Refract native watch-history sync

This review branch is based on `beta-branch`.
It contains no BatCave or installer changes.

## Implemented

- Opt-in Refract integration in Settings → Trackers.
- Personal API key stored using Harbor's credential store.
- `GET /v1/me` to verify the connected account.
- Harbor → Refract completed movie and episode watches.
- Refract search by IMDb, TMDB or TVDB identifiers.
- Persistent retry queue and status diagnostics.
- Primary Harbor profile guard.
- Playback completion uses Harbor's existing 85% rule.
- Offline episode retries preserve the actual `watched_at` time.
- Movies use stable `Idempotency-Key` headers.
- Episodes use idempotent `PUT` watched-state requests.

## Not implemented yet

- Refract → Harbor reverse synchronization.
- Episode-rewatch logging and show rewatch sessions.
- OAuth app registration and device-code sign-in.
- Import of Refract library, watchlists or ratings.

## Test permissions

In Refract, open Integrations → Access and connected apps.
Create a fresh personal key with these scopes:

- `profile:read`
- `library:read`
- `history:write`

Revoke any API key previously exposed in messages or logs.
Never put a personal key into a repository or GitHub issue.

## Validation before merge

1. Run format, lint and TypeScript checks.
2. Use a fresh key to confirm `GET /v1/me`.
3. Play a movie and an episode to completion.
4. Verify watch dates and duplicate protection in Refract.
5. Test offline retries and insufficient permissions.
6. Test anime numbering and unknown external identifiers.
7. Confirm changing Harbor profiles does not cross-sync.
8. Review write behavior after manual marks and rewatches.

Do not merge or build a distributed installer before these pass.

## Plan for two-way synchronization

1. Call `GET /v1/changes/head` before the initial snapshot.
2. Page through library and watched-history endpoints.
3. Match titles by external IDs and media type.
4. Apply changes from `GET /v1/changes` idempotently.
5. Store the cursor only after changes are saved.
6. On `SYNC_RESET_REQUIRED`, recreate the snapshot.
7. Preview incoming changes before writing to Harbor.
8. Prevent echo loops and avoid destructive sync by default.
9. Add OAuth 2.1 public-client authentication later.

Refract's change feed allows a one-minute background cadence.
The official API limit is 120 requests per minute per member.

## API documentation

- https://getrefract.app/developers/authentication
- https://getrefract.app/developers/search
- https://getrefract.app/developers/writing
- https://getrefract.app/developers/sync
- https://getrefract.app/developers/rate-limits
