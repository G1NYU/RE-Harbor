# Harbor functional upstream proposal

Base: `feature/music-reliability` (a ten-commit branch derived from `beta-branch`).
This branch is deliberately independent of VOID's interface redesign.

## Included

- Native playback recovery, consent-aware source replacement, bounded buffering and source-cache controls from the original reliability branch
- FFmpeg spectrum metadata parsing correction and native meter state, with tests
- Last.fm Now Playing/scrobble threshold delivery improvements
- Cover Art Archive fallback behavior for unavailable artwork
- Opt-in Harbor → Refract movie/episode and watchlist synchronization with verification, early logging thresholds, secure secrets, retry queue, identity guards, account isolation and focused tests

## Excluded intentionally

- VOID chrome, typography, sidebar, hero and Music Listening Room CSS/UI
- Miku/GIF visual effects and player-dock redesign
- Experimental VK Music source work (separate branch; requires approved audio API access)
- Refract → Harbor reverse synchronization

## Review strategy

Cherry-pick independent commits by feature: music reliability first, native audio/scrobble improvements second, Refract integration third. Do not merge the combined feature branch wholesale until CI and Windows smoke tests pass. Preserve all existing Harbor settings and upstream connectors.

## Verification required before a proposal

- `vp run typecheck` and targeted JS playback, music-meter, Refract API/account/sync tests
- Rust native tests for spectrum and Last.fm behavior
- Windows playback recovery check (audio source loss/resume), visualizer meter when audio is playing, Last.fm threshold, Refract watchlist add/remove and episode mapping
- Confirm no unintended CI deploy or auto-update channel change

## State

Prepared for review on 2026-11-19. The branch must not be called validated until its own CI completes after an approved push. All VK source work stays isolated.
