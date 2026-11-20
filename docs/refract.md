# Refract tracker

[Refract](https://getrefract.app/) · [API documentation](https://getrefract.app/developers)

In Harbor, open Settings → Trackers → Refract and connect using a personal API key from Refract. Use profile:read, library:read, library:write and history:write. Do not share or commit your key. Harbor uses its existing secret store.

This opt-in integration sends movie and episode watches (manual or playback) and new Harbor watchlist additions/removals to Refract. The playback setting accepts a percentage or a time threshold; natural completion also logs. Early Refract logging counts as watched in Refract but does not change Harbor's own completion threshold. Only the primary profile is synced.

Watched events are queued locally for retry, with original timestamps and duplicate protection. Identity resolution uses external IDs rather than guessed titles. Watchlist changes use membership-only endpoints, preserving existing watched history and other library statuses. Unmatched items are reported in the Refract settings.

The initial upstream contribution is outbound only. Reverse history/watchlist sync, bulk imports and additional media types are not included.

## Validation

The earlier isolated Windows preview was smoke-tested by users across multiple accounts, including authentication, manual and automatic logging, time/percentage thresholds, and watchlist addition/removal. The port to the latest upstream development branch needs a fresh automated and Windows smoke-test pass.

Run the project's standard typecheck and tests. Focused Refract tests: `node --test tests/refract-api.test.mjs tests/refract-sync.test.mjs`. The existing resume-autosave session tests also exercise the separation between early Refract logging and native completion.

## VOID preview integration (November 20, 2026)

The isolated VOID preview includes the Refract implementation verified in upstream PR #103, including retrying HTTP 409 history conflicts and the queued-flush handoff. The Library's Stremio removal action now also sends the Refract Plan to Watch removal after provider confirmation, with a captured Refract key and active primary profile guard. Local-only watchlist removals continue through the existing `toggleWatchlist` synchronization path.

The Settings sidebar, Trackers panel, and Licenses & attribution use the [official transparent Refract logo](https://getrefract.app/press). Credentials remain stored in Harbor's secret store, not embedded in the build. The preview is outbound-only; it does not implement reverse Refract → Harbor synchronization or the separate follow-up PRs #7/#9.
