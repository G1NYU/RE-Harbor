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

## VOID 03 short-window visual audit (2026-11-18)

- Reviewed the actual Edge screenshot artifact from `44289823045`: a 960×600 title view cuts off the primary button, despite passing horizontal-overflow checks.
- Added a short-desktop-viewport (`741px+` wide, `700px-` high) compact title composition. Ordinary, mobile, and taller desktop layouts are unchanged.
- The browser smoke suite now asserts that the primary title action is visible at 960×600 and saves separate `series-top`/`series-episodes` screenshots to avoid confusing auto-scroll with layout clipping.
- Follow up by rerunning the Windows rendering workflow and inspecting its artifact. This alone does not verify real providers, native playback, or full release readiness.

## VOID 03 title actions overlay (2026-11-18)
- The primary "More options" title action opens the original VOID side panel, not the classic Harbor detail page.
- Source choice, movie download, favorites and watched status dispatch through existing Harbor controllers, preserving Refract/watch history and local/online playback logic.
- The remaining low-frequency features still have an explicit advanced compatibility route into the legacy detail tools. This remains a release blocker pending feature-parity replacement.
- No installer, updater, deployment or other themes changed. Full Windows interaction checks are required after this patch is pushed and CI runs.

## VOID 03 Windows Escape regression fix (2026-11-18)
- Windows rendering run `44294807005` failed because the native title dialog's Escape key was captured by Harbor's TV navigation before reaching its document keydown handler, incorrectly popping the title route.
- Mark the dialog's existing close button with `data-tv-modal-close`. Harbor's `runBack` then dispatches Escape to the actual dialog closer instead of navigating away. Added an assertion that the title route remains active after closing.
- Typecheck and Refract workflow `44294807032` passed on the preceding commit. Windows rendering needs re-run.

## VOID 03 native stream browser (2026-11-18)
- Added an independent `VoidSourceBoard` for VOID's manual picker and download-source selection. Original Harbor stream layout remains for every other theme.
- The board uses the existing ranked/filtered stream data and `playManually` callbacks, with provider, quality, cache and codec/source/HDR/audio facets, a featured choice, paged alternatives, match hints and download state.
- Maintains existing stream pipeline, debrid/P2P confirmation, saved filter management, and Refract playback entrypoints.
- Feature parity still requires real-provider stream selection, native Windows video playback, and source-recovery testing. No installer or deploy configuration changed.

## VOID 03 stream-board Windows integration smoke
- Added a deterministic mock Stremio addon to the isolated Edge rendering test. Its two synthetic playback URLs exercise source discovery and filtering, but are never played.
- The test navigates to VOID Watch, opens a title, uses the native title-actions dialog, waits for the new source board and verifies source rows plus advanced facets. Its screenshot is stored as `void-sources.png`.
- Real addons, streaming, downloads and Windows native playback are not yet verified by this synthetic integration test.

## VOID 03 stream fixture correction
- Windows run `44296915311` found two mock streams but no playable items because the fixture's source name included "Preview", which is intentionally treated as a trailer/extra marker by `applyTrust`. The new board was therefore correctly not rendered.
- Renamed the synthetic source to `VOID Fixture Source`, gave streams full matching release filenames, and provided plausible file sizes. Production trust, ranking and filters are unchanged; repeat the integration run.

## VOID 03 source-room visual review
- Inspected the successful mocked-addon Edge screenshot from `44297826046`; old picker headings and wide vertical gaps pushed the featured source below the 1280×800 first viewport.
- Compact VOID-only source-room spacing and the featured-source composition. No functionality or safety diagnostics removed.
- Added a first-viewport geometry assertion, plus separate screenshots for the compact default and expanded advanced-filter layouts.

## VOID 03 native custom lists
- VOID's title actions now expand an original custom-list organizer without routing into the legacy Harbor detail page. Uses existing profile-aware membership and atomic list creation operations.
- The Windows smoke fixture provides a list, toggles membership and checks persisted membership before closing the title dialog. New structural regression guards the native handlers.
- Remaining legacy advanced tools include trailers, reminders, and integration-specific actions; keep compatibility until they are replaced and tested.

## VOID 03 native trailer entry
- Added direct "Watch trailer" action inside VOID's title controls and routed it to the existing trailer-resolution/playback engine, without opening Harbor's legacy detail page.
- VOID's trailer overlay uses a flat no-blur full-screen treatment. The compatibility version retains its original presentation for other themes.
- Marked the overlay closer for Harbor's global Back/Escape navigation and added browser coverage that the video modal closes back to the VOID title.
- Real trailer extraction, network playback and casting are not verified by the mocked browser test.

## VOID 03 series reminders
- Native title tools for series now manage episode/season reminders and notification tone without opening the legacy detail interface.
- Operations reuse the existing `setReminder`, `removeReminder`, `useReminder` and notification-permission workflow, preserving other themes.
- Browser smoke now tests reminder persistence on an actual title route with mocked metadata; no real notification delivery or external source changes are claimed.

## VOID 03 title tools keyboard containment (2026-11-18)
- Include list-name fields and reminder dropdowns in focus-trap sequencing rather than enumerating only buttons.
- Windows browser smoke checks Tab movement into list creation and wraparound to the dialog closer.
- No changes to playback providers, Refract, installer or deployment.

## VOID 03 ultrawide composition audit (2026-11-18)
- The Windows 2560×1080 screenshot showed the title content confined to the left side of a mostly empty feature stage when mock data lacks artwork.
- At widths 1900px and above, center the poster/copy composition without changing tablet and ordinary desktop layouts.
- Windows Edge smoke asserts ultrawide poster geometry; real title artwork and native playback still require device review.

## VOID 03 inline episode tracking (2026-11-18)
- The independent series episode list now has an explicit native actions control per episode for mark watched / unwatched and marking released episodes through the selected episode in the current season.
- Actions dispatch through `setContextWatched` / `requireMediaActionSuccess`, retaining native Harbor and configured tracker writes, including Refract watch events, while surfacing partial provider failures.
- Manual watched-state subscription refreshes visible status; the episode playback click target remains separate.
- Added deterministic episode grouping regression tests and mocked Windows Edge watched/unwatched interaction smoke coverage. Real-provider writes and Windows media decoding still need direct validation.

## VOID 03 direct-source playback smoke (2026-11-18)
- Extended the Edge test past manual source discovery into the existing resolution pipeline and player stage. The browser must decode a video frame from the chosen source and render VOID's own player transport.
- Generates a small VP8/WebM clip in the Windows Edge test using canvas and MediaRecorder. Intercepts the synthetic addon URL with CORS and byte-range support; no outside network dependency or checked-in media file.
- Covers browser source handoff and first-frame decode, not native libmpv, real-world addon health, TV remotes or installer packaging.

## VOID 03 first-frame capture regression (2026-11-18)
- Windows rendering run 44310675313 reached the player and decoded a video frame, but the prior smoke checked video dimensions in a second call after Harbor's short-stream guard had reset the 1.4-second synthetic clip. The second width was zero.
- Capture decoded dimensions and source URL atomically in the same `waitForFunction` result. Keep short-stream detection enabled; this test is for the first decoded frame, not long-running stream validity.
