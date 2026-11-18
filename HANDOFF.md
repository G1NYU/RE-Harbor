# VOID Edition 02 — Development Handoff

## Current branch
- Repository: `G1NYU/RE-Harbor`
- Active branch: `feature/void-02-editorial-pages`, based on `feature/void-02-native-shell`
- Earlier verified shell/installer: `bad2e5d932007deb95ceb5d4fee40b9dab49a1f6`
- Preserve the known-working VOID/Refract branch `feature/void-refract-preview` unchanged.

## Current implementation
- Moved VOID command bar into the application's flex layout; it no longer overlays page artwork.
- The Music search uses one source-aware contextual search, not a second global search field.
- Music home now has its own editorial mast; detail views do not render the home mast.
- Music home now places a clickable recent-track queue inside the immersive artwork hero, with flat shortcuts beneath it.
- Album/artist/playlist/track detail page contains a first-class, full-bleed, artwork-driven hero composition.
- New `MusicTrackRow` editorial variant provides a larger row, artwork and typography without changing other themes.
- Music search tracks use the editorial list with real play, queue, playlist and open-item handlers instead of a three-column grid.
- The VOID music player's left-hand control opens/collapses Now Playing, rather than hiding the bar.
- Compiled VOID stylesheet `src/chrome/void/void-music-editorial.css`, with responsive rules and no backdrop blur.

## Verified
- TypeScript, prior VOID/Music and Refract regressions passed on GitHub Actions run `44269658219`.
- New structural regression tests added as `tests/void-music-editorial.test.ts` (verify in subsequent CI).
- **Not verified yet:** Windows installer build from this branch; on-device visual/interaction test. Preview workflow was enabled for VOID 02 feature branches.

## Next engineering stages
1. Review the new editorial Music pages in a fresh isolated Windows preview and resolve layout issues based on screenshots at 1280x800, 1600x900 and smaller windows.
2. Extend structural redesign to media detail pages, shared navigation, Settings, libraries, source picker and remaining categories. Do not simply theme old page layouts.
3. Rebase latest reviewed fixes from Refract PR #103 with API/sync tests.
4. Prepare isolated NSIS preview, test installation/uninstallation, then plan final packaging.

## Safety
- No changes to ordinary Harbor installer, updater, defaults, secrets or deployment configuration.
- Source handlers are retained; no removal of playback sources or Refract integration.
- Existing branch `feature/void-02-native-shell` and working preview remain available for rollback.
