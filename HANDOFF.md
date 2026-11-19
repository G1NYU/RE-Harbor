# Harbor Music Polish — handoff

Updated: 2026-11-19

## Baseline and branches
- Repository: `G1NYU/RE-Harbor`.
- Working branch: `feature/harbor-music-polish`, created from `feature/void-refract-preview` commit `9c89330eff5a08a208eaa4ac62017b8ac027cede`.
- Original baseline passed Windows preview [44052102329](https://github.com/G1NYU/RE-Harbor/actions/runs/44052102329) and VOID/Refract [44052102318](https://github.com/G1NYU/RE-Harbor/actions/runs/44052102318) on 2026-11-17.
- The abandoned full UI redesign remains preserved on `feature/void-03-workspaces`. Never merge, reset or delete it as part of music polish.

## Requirements grounded in seven red-annotated screenshots
- Restore the original Harbor-based UI that the user liked. No more VOID 03 app-wide redesign.
- The bottom music bar should reach both edges of the entire application. Clicking unused bar surface should open the complete Now Playing environment, not just enlarge album art. The bar's real transport/seek/volume, artist and song links, menu actions, and collapse behavior must continue to work.
- Fix the fixed topbar colliding with scrolled poster rows, music results and breadcrumbs. Transparent topbar appearance needs an opaque backing after scroll.
- Remove the long separator below For you / Explore / Library while keeping the active tab indication.
- Fix long music search track titles, overpacked columns, row spacing and track action access.
- Give the Masayoshi Takanaka-style artist view a genuine design pass: full available page width, large rectangular photograph, editorial typography/actions, fan metadata, balanced artist toolbar and readable track columns. Preserve real albums, queue, player, Refract and external sources.
- Keep track sections and controls responsive and usable in narrower windows.

## Prepared code review scope
- `src/chrome/topbar.tsx`: scroll collision backing.
- `src/components/music/music-sticky-title.css`: sticky title below fixed 80px header.
- `src/components/music/music-tabs.tsx`: remove unwanted tab-wide border.
- `src/components/music/music-track-grid.tsx` and `src/views/music/music-page-system.css`: two-column max search tracks, matching skeleton, larger rows, scrolling clearance.
- `src/components/music/music-dock.tsx` and `.css`: true full-bleed bar except Games-specific sidebar reservation, explicit accessible expand button, click-to-expand from unused surface.
- `src/views/music.tsx`, `src/views/music/music-detail.tsx` and `.css`: artist-specific full-width editorial hero and responsive two-column track listing.
- `tests/music-ui-polish.test.ts`: regression checks for these invariants.
- `.github/workflows/music-void-ui.yml` and `music-windows-preview.yml`: enable checks and isolated portable preview on this branch. No installer publishing, secrets or deployment changes.

## Verification and next steps
- 15 source-level consistency checks passed on the detached draft; these are not a substitute for TypeScript, runtime or visual checks.
- The approved UI patch was pushed, and the source/visual/regression checks passed. Browser geometry is verified with synthetic fixtures rather than a signed production build.
- The first portable build passed at GitHub Actions run 44389549093. The build with Last.fm improvements passed at run 44398691329 and uploaded a complete portable Windows x64 artifact. Real source playback, scrobble account reporting and Windows device/OS integration still require manual application testing.
- Do not claim the UI or playback is fixed before those checks pass.

## Album-detail screenshot clarification
- The last attached photo is an album page ("There Will Be Blood"), not an artist profile.
- Added a **separate album-only design** so its header artwork/title/actions use width normally occupied by empty filler. Tint/background fades and blurs toward both the right window edge and the section below; text/art remains sharp. The album track rows form two balanced desktop columns, returning to one column in narrow windows.
- Artist pages remain their own editorial layout. Playback, album metadata, track ordering in the source array and source selection are unchanged.
- The approved album change is merged into the music-polish branch. Browser layout captures passed at 1600px.

## Validation note (2026-11-18)
- First branch CI run 44389549097 passed TypeScript but failed one new test that expected only artist pages to be full-width. The intended wide layout applies to both artist and album pages; corrected the test regex without changing production code.
- The first portable Windows build was still compiling during this correction. Verification on the new test commit is pending.

## Visual screenshot timing refinement
- Edge rendering run 44393486339 passed geometry checks. The immediate screenshot of the 280ms Now Playing opening animation was captured while opacity was between 0 and 1, making underlying Music home visible.
- Updated the test to await completion of all opening animations and assert a solid background, full opacity and full-window bounds before capturing Now Playing. No production change necessary unless this settled-state assertion fails.

## Scrolled chrome screenshot gate
- Added an Edge viewport test that scrolls a populated artist track listing, asserts the topbar backing is opaque after its transition, captures a scrolled screenshot, and restores scroll position for narrow-window checks. This directly covers the original poster/toolbar overlap complaint.

## Responsive artwork/header refinement
- After inspecting 960x700 Edge screenshots, the 340px portrait stacked above the artist name and pushed the identity below the initial viewport. The 850px container breakpoint now keeps a smaller image alongside the name; stacking begins only under 620px.
- Added a browser check that the artist name is visible at 960px while track columns collapse to one.
- The responsive artist refinement was pushed and passed visual CI. Latest 2048px/960px captures are available from run 44401093207.

## Last.fm and FMHY implementation (2026-11-18)
- Audited real FMHY-referenced open-source players and existing Harbor Last.fm/MusicBrainz/ListenBrainz support. See `docs/music-ecosystem-references.md`.
- Corrected the native Last.fm threshold: track updates now send when actually listened for >=50% or four minutes, not only on EOF, and <=30-second recordings are excluded. Skip/seek behavior remains protected by real listened-time accounting and one-send flag.
- Added an optional Last.fm Now Playing event after mpv FileLoaded when the account is connected; no credentials transmitted without authorization. The optional presence failure must not affect audio.
- The newer portable artifact containing this change was built successfully in run 44398691329. Live Last.fm account and real-stream verification still require Windows user testing.

## Windows archive extraction regression (2026-11-18)
- CI run 44397942285 failed in `pnpm run setup` before native compilation: the Windows runner's `Expand-Archive` invoked an unavailable .NET `ExtractToDirectory` overload. FFmpeg and FFprobe were downloaded but could not be extracted.
- `scripts/fetch-binaries.mjs` now uses Windows built-in bsdtar (`tar -xf`) for ZIP archives instead of PowerShell. Tarball extraction and non-Windows ZIP behavior are unchanged.
- A dedicated test checks the Windows extraction path. The newer portable build passed; this verifies compilation and packaging, not authenticated Last.fm calls.

## Browser UI and native validation snapshot (2026-11-18)
- Edge visual run [44401093207](https://github.com/G1NYU/RE-Harbor/actions/runs/44401093207) passed after adding 2048x1124 coverage. Artist title/layout, two-column tracks, 960px responsive collapse, topbar opaque scroll, full-width dock and full-screen Now Playing were inspected. Synthetic artwork and a mocked-native startup warning are test-fixture limitations, not verified real-provider behavior.
- Native typecheck/music/Refract/Windows sidecar regression run [44401093244](https://github.com/G1NYU/RE-Harbor/actions/runs/44401093244) passed.
- The newer Windows artifact build [44398691329](https://github.com/G1NYU/RE-Harbor/actions/runs/44398691329) completed successfully. The bundled artifact is named `harbor-music-polish-windows-x64`; it was downloaded, structurally inspected and CRC-tested. Last.fm still needs live account testing.
- Source reference audit now includes LiMusic, Feishin, fooyin, muffon, Pear, Last.fm, MusicBrainz and ListenBrainz, with license boundaries. No code from copyleft clients copied.

## Build delivery verified (2026-11-19)
- Source commit compiled: `235d2528f2a46f4f0d8fa621d60df1bd9da6f188`. Later commits through `a228ccc0e8f5eff8787a08cc08f3ba0ebe4a478d` affect only browser tests and documentation, not compiled source.
- Windows workflow [44398691329](https://github.com/G1NYU/RE-Harbor/actions/runs/44398691329): **success** including native Tauri build, uninstaller compilation, payload verification and artifact upload.
- GitHub Actions artifact: [harbor-music-polish-windows-x64](https://github.com/G1NYU/RE-Harbor/actions/runs/44398691329/artifacts/14472536747), artifact ID `14472536747`, compressed size 378,331,355 bytes.
- Direct artifact inspection: 17 ZIP entries totaling 714,533,432 uncompressed bytes; `harbor.exe` has Windows MZ executable signature, `ffmpeg.exe`, `ffprobe.exe`, `yt-dlp.exe`, `mpv.exe` and `libmpv-2.dll` are present; ZIP CRC test passed.
- SHA-256 of the downloaded ZIP: `3f81a50743e7878dc7d2da2549548caa31039eb2ce6aba22b06136b904c58441`.
- Portable README says app identifier `app.harbor.voidnativepreview`; normal Harbor installation is not overwritten. Preview is unsigned and intentionally omits Android extension support and the Pokemon engine.
- Latest Edge browser visual test [44401093207](https://github.com/G1NYU/RE-Harbor/actions/runs/44401093207): **success** for dock, Now Playing, album/artist, scrolled chrome and 960/1600/2048 layouts, on synthetic providers. Latest native/UI/Refract checks [44401968855](https://github.com/G1NYU/RE-Harbor/actions/runs/44401968855): **success**.
- **Remaining manual acceptance checks:** On Windows extract ZIP to fresh folder and run `harbor.exe`; verify initial launch, source connection, actual song playback, pause/resume, seek, queue controls, docking/undocking, OS media controls, album/artist metadata/artwork, source switching, and Last.fm account authorization, Now Playing, thresholded scrobble without repeats. Test Refract and Movies unchanged.
- The app cannot be declared fully user-accepted without these actual Windows interactions; no production release, automatic deployment, branch overwrite, or installation was performed.


## Final screenshot-led UI pass (2026-11-19)
- Seven annotated user screenshots inspected at 2048x1124. Scope: preserved Harbor music polish, no VOID 03 replacement.
- Relocate VOID sidebar Big Picture, Collapse and account/login controls to upper-right topbar, preserving parental lock indicator and original non-VOID footer; do not let full-bleed music dock cover them.
- Replace hard rectangular active nav highlight with a left-to-right fade; preserve icon and slim selected marker.
- Improve Music search affordance: remove double outer border, increase input/scope separation and width; use full available canvas for Explore instead of narrow centered columns; group discovery filters.
- Consolidate artist external sources, official website and MusicBrainz into a single resources section with meaningful link labels and accessible buttons.
- Move Top 10 rank numbers onto posters; avoid giant outline numbers in VOID, keep other themes intact.
- Make VOID media connecting logo transparent and flat instead of a rounded bordered tile. Other loader themes unchanged.
- Run `tests/void-final-ui.test.ts`, TypeScript, music/VOID/Refract suite, Edge screenshots, and Windows portable build. Inspect all results; do not claim user-acceptance for real services without on-device tests.

## Final visual sweep — nested Music search border
- Reviewed the passing 1600/2048px Edge screenshots from run 44438992588. The faded sidebar selection and top-right account controls render correctly.
- Found one remaining nested search input outline caused by the high-specificity VOID global `input[type="search"]` style. Add an equally scoped reset for the Music mast input, leaving focus indication on the outer search form.
- Edge smoke now asserts the **input** border width is zero, not only the outer form's border. This is visual only and does not affect music search requests.

## Music queue polish (2026-11-19)

Prepared on `feature/harbor-music-polish` from `9afecca`. The queue header pairs the upcoming track count with localized minutes when every upcoming duration is known. The source picker can be dismissed during a lookup. Escape and remote Back dismiss one layer and restore focus. Keyboard focus reveals the cover transport, and row actions wrap with direction-aware indentation.

The implementation touches the queue component, its CSS and the shared keyboard handler. The browser fixture exercises the running UI with synthetic tracks and an explicitly delayed source response. Local Chromium passed the queue checks at 320 and 1600 pixels and the existing dock, Now Playing, album and artist layout suite. TypeScript passed with a 4 GB Node heap. The focused Node run passed 61 tests, including keyboard and queue regressions. Additional browser checks confirmed keyboard cover visibility and suppression of the duration for empty queues and unknown durations.

The formatter reports existing issues in the queue TSX and the browser smoke script, also reproduced on the base revision. The Linux system build requires Cargo, which is unavailable on this host. The next push triggers the branch's visual smoke, VOID/Refract validation and Windows portable preview workflows. Check their results and the preview on Windows after approval.
