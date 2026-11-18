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

## Latest Refract PR #103 synchronization patch
- Imported the upstream replay-while-flushing and terminal HTTP 409 handling from `feature/refract-upstream` at `99366702f6cecda33ff335f05747d993dbcd9be1`.
- Added upstream concurrency regression coverage from `tests/refract-sync.test.mjs` and `tests/refract-api.test.mjs`.
- Existing API client and identity mapper remain unchanged (identical hashes).

## Next engineering stages
1. Review the new editorial Music pages in a fresh isolated Windows preview and resolve layout issues based on screenshots at 1280x800, 1600x900 and smaller windows.
2. Extend structural redesign to media detail pages, shared navigation, Settings, libraries, source picker and remaining categories. Do not simply theme old page layouts.
3. Rebase latest reviewed fixes from Refract PR #103 with API/sync tests.
4. Prepare isolated NSIS preview, test installation/uninstallation, then plan final packaging.

## Safety
- No changes to ordinary Harbor installer, updater, defaults, secrets or deployment configuration.
- Source handlers are retained; no removal of playback sources or Refract integration.
- Existing branch `feature/void-02-native-shell` and working preview remain available for rollback.

## VOID 03 new architecture branch (2026-11-18)
- Branch `feature/void-03-workspaces`; preserves all previous branches for rollback.
- Navigation and player have been replaced at the component level, but category content remains to be rewritten before distribution.
- Full specification: `docs/VOID_03_ARCHITECTURE.md`.
- No installer or releases should be produced from this branch until feature-parity/visual validation are satisfied.

## VOID 03 progress: independent Listen workspace
- `src/views/void-studio/music-workspace.tsx` uses the native Harbor data provider and catalog APIs but owns its own navigation, full-artwork home, search, library, track list and album/artist/playlist views.
- `src/views/void-studio/void-studio-music.css` controls the new layout, independent from Harbor's inherited templates.
- `src/App.tsx` routes VOID into `VoidStudioMusic` and preserves `MusicView` only for other themes.
- `tests/void-studio-music.test.ts` checks topology, engine interactions and static responsive CSS.
- **Still WIP:** Refract remains under its separate tracking backend; search source management, full playback controls/lyrics/casting, Settings and every non-Music media space need real redesign and visual verification. No installer from VOID 03 yet.

## VOID 03 Watch workspace (2026-11-18)
- `src/views/void-studio/watch-workspace.tsx`: original cinematic Films/Series workspace, TMDB catalog rows when configured and Cinemeta fallback without TMDB.
- `src/views/void-studio/void-watch.css`: full featured stage, filmstrip selections and in-workspace info drawer, no legacy Harbor Movie/Show components.
- `src/App.tsx`: active VOID Movies and Shows are routed to `VoidWatchWorkspace`; other themes preserve their existing pages. `openMeta` preserves playback, watch history and Refract data flow.
- **Parity gaps:** detailed episode/playback picker remains the original native route, Anime and other spaces await new layouts. Do not ship installer yet.

## VOID 03 title, source selection and video controls

- Branch `feature/void-03-workspaces`, based on `c807b7b`. Film and series title pages call the existing detail controller for resume, local/server choice, cloud history and group playback. More options opens the complete native title toolset.
- The season browser combines TMDB descriptions with native episode IDs. Provider-only episodes and season zero remain selectable.
- The manual picker has a separate title panel and source workspace. The default video transport has a compact playback console and expandable controls. Explicit player shell selections, PiP and kids modes retain their existing controllers.
- Local VOID, music UI and Refract checks passed (70 tests). Production Windows playback, screenshots and installer testing remain outstanding. Chromium startup in the development container is blocked at its process-singleton socket.

## VOID 03 browsing and listening

- Watch checkpoint `01e5fb6` passed GitHub Actions run `44287862477`.
- Start indexes configured catalogs. Anime and Library use the profile's existing picks. Read uses manga and eBook covers, Play has a game selection with save/open actions and Live displays the current and next programs from the guide.
- Library exposes connected trackers through a section selector. Desktop Settings opens its page directory on demand. Listen adds speaker selection, audio settings, lyrics and the source recovery dialog.
- Targeted local tests passed (90). Windows browser rendering and native playback validation are outstanding.
