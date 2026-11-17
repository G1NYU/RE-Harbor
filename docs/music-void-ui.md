# Harbor Music — VOID × Catppuccin Listening Room

## Phase 2, first UI pass

A dedicated music-only appearance on branch `feature/music-void-ui`:

- Mocha-black/purple surfaces and subdued baby-blue transport accent
- 88px dock, 56px play control, and larger album artwork
- Flat backgrounds: no gradients, glass blurs or artwork-derived color wash
- Expanded listening view with larger artwork, stronger metadata, readable controls and tabs
- Existing shuffle, repeat, seek, queue, cast, source switching, lyrics and volume remain functional
- Music UI is explicitly scoped using `data-music-premium`, so other Harbor sections are unaffected
- No new network requests, UI polling, poster remounts, or animations

This is a **code prototype**, not a visually reviewed screenshot. It is isolated from
`feature/refract-upstream`, `feature/music-reliability`, and `feature/music-okru-experiment`.

### Next

Inspect this build on Windows at regular and narrow window widths, including RTL and
keyboard-only navigation. Then replace the existing music landing experience with a
dedicated shelf/navigation system using already available music catalog data.

## Hub refresh, first pass

The For You default no longer mounts the animated, provider-selected editorial hero.
It opens a personal Listening Room featuring the current or last listened recording,
large stable artwork, direct library/provider/settings navigation, and recent tracks.
It does not start automatic video previews or rotate a random track. Uses
`useMusicNowPlaying` for playback identity and phase to avoid re-rendering
its artwork on every progress tick.
