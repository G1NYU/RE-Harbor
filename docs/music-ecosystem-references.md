# Music improvements from FMHY and open-source players

Reviewed: 2026-11-18. Purpose: improve the **restored Harbor Music interface** with ideas from other developers, not recreate VOID 03.

| Source | Practical idea | Harbor status and next step |
| --- | --- | --- |
| [FMHY music index](https://fmhy.net/audio) | Compare clients, metadata, discovery, lyrics and tracking services instead of treating a source as universal | Ongoing reference; evaluate availability and source licenses before integration |
| [muffon](https://github.com/staniel359/muffon) | Artist/discography tabs, related music, tag browsing and multiple playable versions | Adopt clear versions/source provenance and genre discovery; do not copy AGPL-3.0 code into MIT Harbor without license review |
| [Pear Desktop](https://github.com/pear-devs/pear-desktop) | Independent player enhancements, transparent player modes, extensions and controls | Adopt contained player interactions rather than new app-wide UI architecture; MIT code still needs attribution and porting from Electron to Tauri |
| [LiMusic](https://github.com/SimoHypers/limusic) | Native Tauri/libmpv playback, persistent radio/automix queue, synced lyrics, mini player and Last.fm at the listen threshold | Harbor already uses libmpv, queue, lyrics and Last.fm. Compare its resume-on-launch, full-player affordances and OS media integration; **GPL-3.0**, borrow UX concepts, not source code |
| [Feishin](https://github.com/jeffvli/feishin) | Server-first Navidrome/Jellyfin/OpenSubsonic library, gapless queues, lyrics and listen-time scrobbling | Harbor already has those server connectors. Improve source health reporting, connection status and queue recovery. **GPL-3.0** code cannot be copied without appropriate compliance |
| [fooyin](https://github.com/fooyin/fooyin) | Queue-led versus playlist-led playback, artwork handling, waveforms, ReplayGain, smart playlists | Use queue-control clarity and safe metadata-fallback patterns. Consider optional queue mode later; **GPL-3.0-or-later**, not a drop-in component |
| [Last.fm scrobbling API](https://www.last.fm/api/scrobbling) | Now Playing on start and a scrobble after half a song or four minutes; songs must be longer than 30 seconds | Native Last.fm auth and scrobbling already existed. This patch adds presence update and threshold delivery so quitting/switching tracks doesn't lose valid listens |
| [MusicBrainz & Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API) | Match correct release IDs and provide album artwork/editions | Already used in the native catalog. Next: alternative cover and release-edition selection, with image licensing and proper fallbacks |
| [ListenBrainz](https://listenbrainz.org/) | Open discovery and listening statistics | Harbor already reads releases and popular artists. Authenticated submission can be added as a separately authorized integration |

## Verified existing files
- `src/components/music/music-lastfm.tsx`: account connection, status, disconnection, error display.
- `src-tauri/src/music/lastfm.rs`: signed native request, authenticated scrobbling.
- `src/lib/music/artist-profile.ts`, `artist-gallery.ts`: MusicBrainz artist profile, Wikimedia images.
- `src-tauri/src/music/connectors/catalog/musicbrainz.rs`: recording/album metadata; `coverart.rs`: CAA artwork.
- `src-tauri/src/music/connectors/catalog/listenbrainz.rs`: discovery data, not personal scrobble submission.

## Technical safeguards
- Last.fm credentials remain user-owned secrets, not included in CI, source, tests or metadata logs.
- The scrobble event is sent once per native playback generation, after accumulated listened time reaches the threshold; seeking and pauses do not count as additional listening.
- Now Playing is optional and is not a successful-scrobble indicator.
- No audio, Refract integration or UI layout code is copied from third-party projects.

## Follow-up priorities after the portable UI verification
1. A track's alternate versions, sources and quality labels (muffon-inspired interaction).
2. MusicBrainz release-edition and cover-art fallback controls.
3. Optional Last.fm listening-history shortcut and ListenBrainz **opt-in** submission.

Do not ship these until source data, licensing, cache/rate limits and Windows interaction tests pass.

## Gap review against actual Harbor components (not promises)
- `src/components/music/music-now-playing.tsx` already has a dedicated expanded screen, queue, track-source button, lyrics and quality indicators. LiMusic-inspired changes should strengthen resume/media-key behavior after Windows user testing, not add duplicate controls.
- `src/components/music/music-track-row.tsx` already offers track menus, labels and actions. muffon-inspired provider/recording versions would be a **new explicit selector**, not a hidden auto-switch between catalogs.
- `src/lib/music/recording-profile.ts` already carries Deezer/MusicBrainz provenance and throttles MusicBrainz requests. Use that provenance for credit/source display rather than claiming a metadata recording is itself playable.
- `src/components/music/music-lastfm.tsx` already shows account connection; Last.fm login still requires user credentials. An app-owned client key would need secure upstream registration rather than hardcoding a private secret.
- Any further large addition should start with one testable source and one clear UX surface. Never restart the abandoned VOID 03 shell redesign to implement these music improvements.
