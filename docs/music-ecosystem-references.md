# Music improvements from FMHY and open-source players

Reviewed: 2026-11-18. Purpose: improve the **restored Harbor Music interface** with ideas from other developers, not recreate VOID 03.

| Source | Practical idea | Harbor status and next step |
| --- | --- | --- |
| [FMHY music index](https://fmhy.net/audio) | Compare clients, metadata, discovery, lyrics and tracking services instead of treating a source as universal | Ongoing reference; evaluate availability and source licenses before integration |
| [muffon](https://github.com/staniel359/muffon) | Artist/discography tabs, related music, tag browsing and multiple playable versions | Adopt clear versions/source provenance and genre discovery; do not copy AGPL-3.0 code into MIT Harbor without license review |
| [Pear Desktop](https://github.com/pear-devs/pear-desktop) | Independent player enhancements, transparent player modes, extensions and controls | Adopt contained player interactions rather than new app-wide UI architecture; MIT code still needs attribution and porting from Electron to Tauri |
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
