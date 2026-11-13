# Refract native watch-history sync

This review branch is based on `beta-branch`.
It contains no BatCave changes. A separate isolated Windows MSI validation workflow is included.

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

## Release authentication: personal API keys

Harbor users will connect their own Refract accounts with a personal API key, consistent with other Harbor tracker connections. OAuth and device-code login are optional future enhancements, **not release blockers**. Never embed one user's API key in an installer, repo, logs, or public configuration. Keep Disconnect and key replacement available in settings.

The existing Harbor native secret-store path persists credentials to `secrets.json` in the app data directory; it is **not OS-keychain encrypted**. Do not describe this as Windows Credential Manager storage or encryption at rest. Review credential file permissions, migration, and backup handling before public release.

## Not implemented yet

- Refract → Harbor reverse synchronization.
- Episode-rewatch logging and show rewatch sessions.
- Import of Refract library, watchlists or ratings.
- Optional OAuth app registration and device-code sign-in (post-release enhancement).

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

The isolated MSI workflow can produce installable test builds now; do not call the integration production-ready or publish a stable release before live validation and the agreed bidirectional watched-state scope pass.

## Plan for two-way synchronization

1. Call `GET /v1/changes/head` before the initial snapshot.
2. Page through library and watched-history endpoints.
3. Match titles by external IDs and media type.
4. Apply changes from `GET /v1/changes` idempotently.
5. Store the cursor only after changes are saved.
6. On `SYNC_RESET_REQUIRED`, recreate the snapshot.
7. Preview incoming changes before writing to Harbor.
8. Prevent echo loops and avoid destructive sync by default.
9. Keep personal API keys as the production login method; consider OAuth 2.1 public-client authentication later.

Refract's change feed allows a one-minute background cadence.
The official API limit is 120 requests per minute per member.

## API documentation

- https://getrefract.app/developers/authentication
- https://getrefract.app/developers/search
- https://getrefract.app/developers/writing
- https://getrefract.app/developers/sync
- https://getrefract.app/developers/rate-limits
