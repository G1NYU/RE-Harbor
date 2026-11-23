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

Queue changes published at `506d8f53` with the same tree as the reviewed local commit. Formatted the queue TSX and browser smoke script in a follow-up. Scoped `pnpm run check` passes all four source/test files and all 61 focused tests pass. The published formatting follow-up is `5b0b188c`. All three application workflows passed on this revision: [VOID/Refract](https://github.com/G1NYU/RE-Harbor/actions/runs/44450609103), [Edge visual](https://github.com/G1NYU/RE-Harbor/actions/runs/44450609098), and [Windows preview](https://github.com/G1NYU/RE-Harbor/actions/runs/44450609028). The [portable x64 artifact](https://github.com/G1NYU/RE-Harbor/actions/runs/44450609028/artifacts/14496172649) is 378,332,415 bytes. Real-provider playback still needs a Windows device check.

For Linux, provisioned Rust, GTK, WebKitGTK, mpv and the JDK in an isolated environment. Capstan staging and its bridge ping passed. TypeScript and the production Vite bundle passed under constrained concurrency. The release build reached rustc for the main Harbor library, then the host killed the compiler with SIGKILL before it produced a binary. Linux packaging remains unverified. Retry `pnpm tauri:build:linux-system` on a higher-memory Linux builder.

## VOID desktop interaction and artwork audit, 2026-11-19

On feature/harbor-music-polish, based on 374756c. The standard sidebar now follows the saved order across its former primary/collection boundary. The editor and context menu move against visible neighbors. Now Playing exposes its visualizer over the cover and uses narrower segmented RMS meters with separate peak ticks. The meter subscription is scoped so channel updates can render independently of the queue. VOID title-bar controls have separate 38px targets. Anime has a dedicated slide above Top Picks, a responsive loading shell, keyboard-focus and reduced-motion rotation handling, and Tune in the hero action row. Manga detail, adaptation copy, Manga browse and shared hero descriptions have stronger contrast.

TypeScript passed with NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=8". The 15 selected music/navigation/VOID test files passed all 72 cases. These include the repaired player dependency fixture, tab/search close assertion and reduced-motion exit assertion. git diff --check passed. The changed-file format check reports seven files that already failed formatting at the base commit.

The browser sweep visited all 17 destinations offered by the test profile at both 960 and 1600 pixels. No document-level horizontal overflow was detected. Offline services produced two fetch errors, several loading or empty catalog views, and the browser-only Music source message exposed the missing native bridge. This pass cannot certify signed-in catalog pages, native window controls or live audio. The synthetic Anime fixture separately exercised a long title and poster fallback. Follow the branch's Windows preview workflow for the portable native build.

Follow-up to 89ce72c. The route sweep exposed an Anime skeleton that could outlive every finished catalogue request. The hero now gives that space back to the rows and keeps Tune accessible without artwork. The Music source counter presents a localized failure message and retains the diagnostic in its title. The browser check now exercises sidebar moves before loading large media fixtures, avoiding a redundant full application reload. The full local browser run passed, including moves across Live TV, persisted order after reload, visualizer on/off and music layouts at 960, 1600 and 2048 pixels.

## Arbitrary sidebar positions and Anime reading link

Based on ff466d9. Edit sidebar now includes a tab selector and an absolute position selector. The drag handler scrolls the navigation list at its edges while the pointer is held and uses the row wrapper for midpoint calculations. In Chromium, all 19 enabled tabs (Sports and Playlists included) occupied each of the 19 positions with the other tabs remaining in order. All 361 placements passed. A separate mouse drag moved Home from first to last and back to first across a scrolling list.

The Anime slide's reading-source link and counter share an opaque surface. Titles wrap over two lines. Pagination has larger click targets and exposes the current slide. Tested with bright white/yellow artwork, a long manga title, and 587 slides. The label measured 7.89:1 and the title and 2 / 587 counter measured 12.14:1 against the rendered surface at 960px and 1600px. The Tune dialog opened from the hero.

## Original VOID sidebar + native visualizer final polish (2026-11-19)
- Branch: `feature/harbor-music-polish`, based on `2a0232c3`. Expanded VOID rail restores WATCH/READ/LISTEN & PLAY/YOURS/MORE hierarchy, text before right-side icons, compact selected pills, and removes the leading selection line. Decorative section labels follow the saved order. Edit mode retains arbitrary positions and drag scrolling.
- Current topbar account/utility placement and full-width music dock remain; other themes and collapsed rail are unchanged.
- Now Playing caption distinguishes native meter loading/on/inactive/unavailable rather than hard-coded Inactive. Miku settings preview uses authored idle sheet animation. GIF preview reports frame count and motion state; one-frame GIFs are identified. Both visualizers explain reduced-motion settings. Audio Settings can use 1180px.
- Static checks added for meter states and navigation. Live music playback, Miku beat motion and GIF playback still require native Windows acceptance.
- Final visual smoke on `1baecc3f` revealed repeated section headings because Harbor's historic default order interleaved Watch, Music and Read tabs. Corrected with a VOID-only grouped default that is applied only when no explicit order is saved. First move/hide uses that same baseline, preserving 361-position edit semantics, and other theme orders remain unaffected.
- Screenshot QA follow-up: the sidebar headings are now anchored to section positions, not to individual tab category IDs. Cross-category moves may reorder icons anywhere without producing duplicate WATCH or LISTEN & PLAY labels. Edge smoke captures the untouched default rail and asserts the unique headings again after a move/reload.
## 2026-11-19: audio-reactive visualizers and left sidebar QA
- FFmpeg `ametadata` prints bracketed filter/address prefixes, which the existing `spectrum::ingest` parser rejected. Accept bracketed and legacy bare formats, with native fixture tests from real FFmpeg logs; playback engine and DSP filters remain unchanged.
- VOID nav keeps groups and custom reorder, but icons, labels and headers now align left, with an Edge geometry assertion and screenshot test.
- Miku, spectrum and GIFs honor OS reduced-motion by default, with a small explicit user opt-in shown only if Windows requests reduced motion. One-frame GIFs no longer run an RAF loop or subscribe to the audio meter. Existing persistent music preferences and GIF assets are preserved.
- These changes have not yet been confirmed with real Windows audio; check native CI, then test Miku/GIF while actually playing and inspect performance.

## Single-song detail hero sizing (2026-11-19)
- Identified the last visual gap in the Music search result → individual track detail. Album and artist pages have grid heroes; track detail lacked a display layout and inherited the fixed `size-48` cover, leaving the title/Play below a tiny image and an almost empty tinted header.
- Added a `data-music-track` discriminator and CSS-only 320px maximum artwork/two-column hero. At narrow container widths, art and controls stack vertically with proper spacing. The existing square `Poster` and playback actions are reused; no extra media, filters, timers, observers or dependencies.
- Source-level and browser geometry regressions check the art's square aspect, title/action alignment, and stacked narrow layout. Do not treat browser fixture validation as native provider playback testing.
- Patch prepared against `feature/harbor-music-polish` at `740c4b3bee6f8028e7ee8f2328b9a55d673e1459`; branch not yet modified pending push approval.

## VOID + upstream Refract isolated test build — 2026-11-20
- Baseline: `feature/harbor-music-polish` at `13e6f2f8`; preserved without modification.
- Preview branch: `feature/void-refract-2026-11-preview`, incorporating only Refract PR #103 behavior changes, the authentic 512px official Refract PNG, and Library removal synchronization. No full upstream merge: it conflicts with dozens of VOID Music/UI files and would risk undoing the approved design.
- New Windows portable preview uses existing isolated Tauri identifier `app.harbor.voidnativepreview`; does not install over normal Harbor.
- The preview excludes separate post-merge reliability follow-ups #7 and #9. Tests and live Refract/Windows playback need verification before claiming release quality.
- Workflows: `music-void-ui.yml` (typecheck and Refract/music regressions), `music-polish-visual.yml` (Edge layout), `music-windows-preview.yml` (portable Windows artifact). No deployment, release, or production application identifier changes.
- Next: verify all three workflow conclusions, inspect the Windows artifact metadata/contents, run `harbor.exe` in a fresh extracted folder and test watchlist additions/removals + movies/series early watched sync, Music/Now Playing, official branding, and account separation. Report exact run IDs and commit hashes after CI.

## Windows installation packaging (2026-11-20)
- Source: exact successfully built and user-tested VOID/Refract portable artifact, run `44737578800`, production application SHA `57b3285`. Test-only changes at `bd7e872` do not modify it.
- Installer branch: `feature/void-refract-2026-11-installer`; uses an independent NSIS setup executable, no application recompilation, no user secret handling, no normal Harbor replacement.
- Per-user install location: `%LOCALAPPDATA%\\Programs\\Harbor VOID`; desktop/start-menu shortcuts and HKCU uninstall entry. Uninstall preserves profile settings. Tauri identity remains `app.harbor.voidnativepreview` and updater is disabled.
- Automated Windows installer workflow validates original/installed executable and media-sidecar hashes, installer registration and silent removal before publishing a GitHub Actions artifact.
- Next: verify workflow run and artifact, inspect failed steps if any. Test normal UI launch and user-profile persistence on actual Windows; no code signing or installer auto-updates are claimed.


### Verified Windows installer delivery (2026-11-20)
- Workflow: https://github.com/G1NYU/RE-Harbor/actions/runs/44761502098 — **completed/success** on commit `92dbc3619a622a89b9f8d375bd1524e54e22d873`.
- Artifact: https://github.com/G1NYU/RE-Harbor/actions/runs/44761502098/artifacts/14642350533 (`harbor-void-refract-setup-windows-x64`, artifact ZIP compressed size 375,732,829 bytes; artifact SHA-256 `761c290eac08cda2fde2dcc66e89c416e13b4e95f394ca2ece2482a528f3acc5`).
- Verified app executable SHA-256: `A351E0143E7AED520DB9FB90BD4390F2E6F6C9A619EB311D9788DC07C9456D8D`. The Windows CI installed app hash matches the original portable app hash, and also matched `mpv.exe`, `ffmpeg.exe`, `ffprobe.exe`, `yt-dlp.exe`, and `libmpv-2.dll` byte for byte.
- The CI performed a successful per-user silent installation, verified Start Menu/Desktop shortcuts and the HKCU uninstall entry, and silently uninstalled it again, confirming executable, shortcuts and registry cleanup.
- NSIS used ordinary zlib compression to avoid long solid-LZMA runtime. The application contents were not recompressed or altered individually.
- Remaining manual verification: a normal interactive install and GUI first launch on the user's actual Windows PC; live Refract and Music are user-tested in the original portable build, not re-tested interactively from the installer inside CI. The setup executable is unsigned and has no auto-update channel; downloading the artifact requires GitHub account access when GitHub enforces it.


## RE-Harbor README and VOID identity (2026-11-21)
- Documentation-only brand/README overhaul for the fork landing page and the VOID + Refract installer branch; no production code, build scripts, dependencies, or workflow files changed.
- New artwork: `docs/media/reharbor/cover.svg` and `brand-board.svg` (flat near-black, Mocha surfaces, restrained signal blue, negative space); user-provided UI screenshots optimized to WebP for `music-home.webp`, `now-playing.webp`, and `media-home.webp`.
- New `docs/VOID-BRAND.md` records palette, typography, spacing, imagery, accessibility and performance direction. The README focuses on the listening room while retaining technical stack, install/build instructions, outbound-only Refract scope, upstream credit, license and no-content policy.
- Custom branch: `feature/void-refract-2026-11-installer`. Fork default: `beta-branch`. The two README copies intentionally link the separate preview branch; docs changes must not be interpreted as an upstream sync or a new installer build.
- Validation performed before commit: screenshot decode, SVG XML parse and visual raster previews, README internal asset paths and Markdown code fences. GitHub rendering and checks should be verified after push.
- Next: separately rehearse upstream beta merge in an isolated branch before touching the custom implementation; then run builds and Windows UI testing. The existing verified installer remains the recovery artifact.

## RE-Harbor vector showcase (2026-11-21)
- Replaced three README raster WebP screenshots with original, self-contained SVG mockups: `docs/media/reharbor/music-home.svg`, `now-playing.svg`, and `media-home.svg`.
- Both `beta-branch` and the installer branch use the same README vector references; removed obsolete `music-home.webp`, `now-playing.webp`, and `media-home.webp` from both branches.
- Vectors were checked for valid SVG/XML and rasterized successfully for visual inspection; no embedded bitmap images, fonts or external asset URLs.
- The README explicitly labels the panels as vector interpretations, not literal application screenshots. Production code, installer workflows, dependencies and binaries were not changed.
- Next: verify GitHub renders the SVG illustrations. Upstream synchronization and a new installer remain separate tasks.

## HarborCommunity v1.0.4 upgrade — 2026-11-22

- Original VOID/Refract installer remains on `feature/void-refract-2026-11-installer` at pinned application snapshot `b81ee522fbb931be0c1d3b63691c7bcb37b030ef`; verified backup `backup/void-before-harborcommunity-v1.0.4-beta-2026-11-22` points there. Do not overwrite or replace either.
- Official upstream base is `HarborCommunity/Harbor` release `v1.0.4-beta` at `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`. Their shared ancestor is `cd2a0aff335fb9936146b6434098a7e10b14a421` (1,112 upstream commits at audit time).
- The full merged **candidate** is `feature/void-harborcommunity-v1.0.4-beta-candidate` and contains real two-parent merge commit `77288752a94beedc56b71cc10794e79c4900f806`. This is the upgraded working source, not a released installer. The isolated merge audit and complete frontend validation passed at [run 45004475982](https://github.com/G1NYU/RE-Harbor/actions/runs/45004475982).
- Windows portable preview originally failed [run 45005542605](https://github.com/G1NYU/RE-Harbor/actions/runs/45005542605) in `ort-sys 2.0.0-rc.10` native DLL copying. Build script copy fallback targets missing example/deps directories. Workflow-only repair in `.github/workflows/void-1.0.4-windows-preview.yml` creates the destinations before compilation; rerun [45007130278](https://github.com/G1NYU/RE-Harbor/actions/runs/45007130278). **Verify the rerun before reporting success.**
- Edge visual smoke originally failed [run 45005593503](https://github.com/G1NYU/RE-Harbor/actions/runs/45005593503): the Queue control was hidden at large container width at the same time the overflow menu was hidden, making it inaccessible. Fixed the production `src/components/music/music-dock.tsx` wide-view queue visibility in commit `3e3e5a54`; updated visual CI path filters in commit `10a1c41a`. Rerun [45007137917](https://github.com/G1NYU/RE-Harbor/actions/runs/45007137917). **Verify browser output; do not conclude merely from compile.**
- Native/visual workflow fixes are isolated to the candidate branch. The candidate's `src-tauri/tauri.music-preview.conf.json` retains identifier `app.harbor.voidnativepreview`, a distinct deep link and disabled updater endpoints. No official installer was overwritten and no deployment was performed.
- Next: inspect both workflow conclusions and failures, resolve from logs (not blind retries), verify portable artifact hashes and DLL dependencies, rerun browser visual screenshots and full suite if source changes require it; then manually test Windows UI, real music playback, visualizers and Refract before authorizing an installer release.


### Harbor 1.0.4 candidate native + visual fixes (2026-11-22, late morning)
- Baseline candidate commit before this pass: `e502a91c092af433f8d1c05efa72fbbd015b0972`. Prior Windows native run [45007130278](https://github.com/G1NYU/RE-Harbor/actions/runs/45007130278) stopped at Rust E0425/E0433/E0599 after the ORT DLL-copy correction. Logs identify undefined `refresh_stream`, missing `std::sync::atomic::Ordering`, and missing `tauri::Manager` for `app.path()`.
- `de0b012640be0b305c52eb1c8a0beee96cc5b5b5`: `src-tauri/src/music/commands/playback.rs` adds imports for `Ordering` and `tauri::Manager`, forwards `refresh_stream` from the command to the internal playback implementation, and retains `resolve_track_with_refresh`. This is a compilation fix, not a bypass of freshness semantics.
- Prior Edge visual run [45007650200](https://github.com/G1NYU/RE-Harbor/actions/runs/45007650200) timed out on a locator. JSX confirms `.music-now-spectrum` is a direct sibling of `.music-now-artwork` in `.music-now-art-column`, not a descendant. `4372a2207022560cda7eb6c5449ee9ae2b82387c` corrects only the test selector. No production visualizer behavior was changed.
- `3cb851641c671619c92496aff1874f466ba9e4f0`: the Windows preview workflow now runs when the native playback module is changed, as well as when the workflow file is updated.
- A new Edge visual test started at [run 45010589144](https://github.com/G1NYU/RE-Harbor/actions/runs/45010589144). **Its result is not yet verified**; native rebuild result is also not yet verified. Continue from actual logs before declaring either successful.
- No production release, installer replacement, user-profile migration, or deployed application update was made. Before completing, verify Edge geometry and audio visualization; then Windows Rust compile, portable exe, runtime sidecar hashes, Refract, music playback, GIF/Miku, and installer isolation. Maintain the old verified setup as rollback.


### Harbor 1.0.4 validated preview results (2026-11-22)
- Edge visual regression [45010589144](https://github.com/G1NYU/RE-Harbor/actions/runs/45010589144) **success**, source SHA `4372a2207022560cda7eb6c5449ee9ae2b82387c`. Visual screenshot artifact `harbor-void-1.0.4-visual-layouts`, artifact ID `14749607815`, GitHub artifact SHA-256 `9936ea564e0722be8cb95ab26d3221db6a11d953d107f795a185f8d59493cb0b`.
- Isolated native Windows preview [45010609357](https://github.com/G1NYU/RE-Harbor/actions/runs/45010609357) **success**, source SHA `3cb851641c671619c92496aff1874f466ba9e4f0`. Rust/Tauri compilation, uninstaller compilation and portable payload assembly/verification passed.
- Portable GitHub artifact `harbor-void-1.0.4-beta-windows-x64-preview`, ID `14750179381`, compressed size `440092937` bytes, GitHub artifact SHA-256 `68491c4d60e9de6e8c7da03fe78c2fcd0005c98e0e87c0b293d7ed8dd59e8adc`. Artifact is not expired at this check.
- No Windows installer release or installed-user profile migration performed. Remaining verification: download/extract and interactively run the preview on a Windows machine, test actual native audio/visualizer, Refract, app settings, identity separation, and later installer packaging/upgrade. CI success does not prove live provider playback.

## 2026-11-22 — HarborCommunity theme engine PR #4 integrated

- Working candidate: `feature/void-harborcommunity-v1.0.4-beta-candidate` at squash merge commit `952bed0c3969e2e3984fab60f82af682c0d47587`. PR [G1NYU/RE-Harbor#13](https://github.com/G1NYU/RE-Harbor/pull/13) is merged. Parent candidate was `9a17e125aea8dc51e20470d1879a64113418c397`.
- Ported exactly 15 files (8 modified, 7 new) from upstream [HarborCommunity/Harbor#4](https://github.com/HarborCommunity/Harbor/pull/4) head `708a65a1343f546dd4570f7d407c0e0b9aaaba74`. Scope: CSP-safe markup actions, custom-chrome drag regions, stable theme HTML nodes, cheap Big Picture slot state, ElegantFin state-class selectors, and regression tests. Existing VOID-specific changes in `src/lib/theme.ts` and `src/index.css` were preserved. Upstream PR #4 remains open at verification time.
- Pre-merge CI: [run 45030726524](https://github.com/G1NYU/RE-Harbor/actions/runs/45030726524) **success**. Frontend formatting/lint, typecheck, and full test suite passed. Native job succeeded via no-native-change detection and **did not recompile Rust**.
- Post-merge GitHub compare against the original candidate confirms exactly 15 files and no unrelated edits. No release, installer replacement, user-profile migration, or deployment was performed.
- Contributor's [Smooth Harbor Themes guide](https://momo-labsz.github.io/harbor-theme-guide/) recommends avoiding deep page-level `:has()` selectors, reusing Harbor's `data-player-chrome-mounted` / other DOM state flags, scoping MutationObservers to specific targets, cleaning up theme state, and preserving selector specificity. These principles explain one measured style-recalculation bottleneck, not all potential GPU compositing/blur or poster-remount costs in original VOID.
- **Next:** Build a new isolated Windows portable preview from the updated candidate (the existing `void-1.0.4-windows-preview.yml` / visual smoke workflows have narrowly filtered push paths and do not automatically run on the 15-file merge). They support manual `workflow_dispatch` on the candidate branch. Do not treat artifacts from runs 45010609357 and 45010589144 as having the PR #4 changes; they predate this merge.
- Acceptance: verify actual Windows launch and separation from main Harbor, release CSP chrome navigation and window drag, Music playback/spectrum/GIF/Miku, Refract early watch logging/watchlist, performance traces comparing vanilla, VOID Native, and selectively restored OG glass; then consider an installer update. Original backup `backup/void-before-harborcommunity-v1.0.4-beta-2026-11-22` and prior verified setup remain rollback options.

## 2026-11-22 — OG Glass poster-stability theme release candidate

- Candidate: feature/void-harborcommunity-v1.0.4-beta-candidate. Optional theme [PR #14](https://github.com/G1NYU/RE-Harbor/pull/14) merged via squash commit 29f249c10d1ac4eab9aaf471ceeb9ffdd52e347c, on top of integrated upstream engine PR #4.
- Exact scope: **two added files**, themes/VOID-Glass-Poster-Stable-1.0.4.harborstyle and tests/void-glass-poster-stability.test.mjs. No existing application code, Native/Music/Refract, CI config, updater, installation identity, or published releases modified.
- Theme selectable as **VOID Glass - Poster Stable**. It preserves OG Glass markup and nearly all existing CSS; stops rewriting native service-card img.src, narrows document MutationObserver to child-list, observes navigation attributes only on the native sidebar, ignores poster subtree mutations, and narrows page-entry fade to hero copy. Custom glass service carousel still uses its own branded images. Keeps existing html[data-player-chrome-mounted] optimization.
- Original OG Glass remains an importable fallback; no existing installed theme was overwritten. This is a theme import for the existing portable 1.0.4 preview, **not** a new executable.
- Verified locally: JavaScript parse, PostCSS style syntax, four targeted tests, source/asset comparison. GitHub [Code Quality run 45052967699](https://github.com/G1NYU/RE-Harbor/actions/runs/45052967699) **success**: formatter/lint, typecheck, complete frontend test suite, Native no-change detection. Earlier formatting-only CI failure in run 45052723185 was corrected with follow-up commit 83a3082ddb4a1881eb3081e5e76b44bc1ca22ea9, without changing the theme asset.
- Asset SHA-256: 85e97326f6b0e3463ef7db8122951d543d2a78d1b0765ded2ca32720a5ad3d04; theme Git blob: 7bb0ff2b1de1f781e1141b5673abf598857b8e44.
- Existing PR #4-equipped Windows portable preview [run 45035748982](https://github.com/G1NYU/RE-Harbor/actions/runs/45035748982) **success** at build-branch commit 8db7076e9802cc053a61070c92e6b11783bb7c46; artifact harbor-void-1.0.4-beta-windows-x64-preview (id 14760377560). User confirmed it was much smoother, but reported poster reloading after applying OG Glass. This is a theme-only fix attempt for that remaining issue.
- **Not yet verified:** visible poster-stability behavior on user's Windows/WebView machine. Local headless Chromium could not start even on a trivial page, so browser-rendering acceptance was unavailable. Existing app Poster remount/cache/row virtualization can still cause visual reloads.
- Next acceptance: import the new theme into already downloaded PR #4 preview, compare Home/Anime/Movies browsing, scroll away/back, navigation fade, original versus stable poster behavior, ensure music dock/expanded player/Refract unchanged. If reload persists, determine whether img src changes, image nodes remount, or only page opacity/blur repaints. Do not claim solved before user-device verification.

## 2026-11-23 — PR #8 TV-card artwork stability

- Upstream source: HarborCommunity/Harbor PR #8, head 5412c11427728c7b6e35bc157c858a1caa72158e, open/unmerged when checked. Contributor isolated repeated TV-style anime wide-art fallbacks when equivalent title meta objects were recreated in Anime rows.
- Upstream measured 35 artwork address swaps (17 blurred-poster fallbacks) before vs 1 hero-logo-only swap and 0 blurred fallbacks with the patch, including under a heavy user theme. These figures are upstream Windows measurements, not verified on our customized installation.
- Fork PR #15 merged: https://github.com/G1NYU/RE-Harbor/pull/15 — squash SHA 67eaf501d8b9ca4541f6563e4b0b2fdfc89c5410.
- Exact 3-file code scope: src/components/tv-card.tsx uses expandingCardArtworkKey(meta, settings.tmdbKey) for useAnimeBackdrop state, effect and result guard rather than meta object identity; tests/card-artwork-state.test.mjs adds two regression cases; tests/tv-card-overlay-stacking.test.mjs updates its mocked import. All 3 upstream PR #8 patch hunks applied without relocation. Preserved local Simkl TV-card anime detection.
- CI: Code Quality https://github.com/G1NYU/RE-Harbor/actions/runs/45101996697 success, formatting/lint, typecheck, complete frontend test suite; Native job succeeded via no-native-change detection (no Rust recompilation).
- Isolated Windows preview source: build/void-1.0.4-pr8-tv-card-preview at fc5208e99ed9d277b71d7bd78f0694de24beda29. Build workflow https://github.com/G1NYU/RE-Harbor/actions/runs/45102081338. Only build-branch workflow updated to trigger this standalone Windows build; no public installer, updater, or deployment mutation. Direct blob comparisons confirm candidate and preview share TV-card/tests, music dock/player, theme engine and optional OG Glass asset.
- The original 1.0.4 Windows preview run 45035748982 does NOT have PR #8; user previously reported marked performance improvement from PR #4 but poster reloads remained. Optional VOID Glass - Poster Stable theme (PR #14) has NOT yet been tested by the user. Do not equate that theme-side patch with the independent upstream TV-card bug fix.
- Next: finish and verify new Windows preview artifact if build succeeds. With the new executable, retain/use ORIGINAL OG VOID Glass first, choose Settings > Poster card style > Row card style: TV, open Anime and let rows populate / scroll, confirm whether previously loaded wide art holds while new rows arrive. Then optionally switch to Poster card style and/or import VOID Glass - Poster Stable to distinguish card lifecycle, theme script, and generic poster reloads. Confirm custom Music and Refract still work. Do not claim user-side fix until measured.
