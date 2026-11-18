# Harbor Music Polish — handoff

Updated: 2026-11-18

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
- The review patch remains unpushed pending the user's explicit approval; the branch HEAD remains its original documentation-only recovery commit.
- After approval: fast-forward only if HEAD is unchanged, inspect CI logs, build portable artifact, review populated Music/artist pages against the screenshots on 1280px/1600px/2048px widths, and perform Windows playback/queue/artist-link/seek/volume testing.
- Do not claim the UI or playback is fixed before those checks pass.

## Album-detail screenshot clarification
- The last attached photo is an album page ("There Will Be Blood"), not an artist profile.
- Added a **separate album-only design** so its header artwork/title/actions use width normally occupied by empty filler. Tint/background fades and blurs toward both the right window edge and the section below; text/art remains sharp. The album track rows form two balanced desktop columns, returning to one column in narrow windows.
- Artist pages remain their own editorial layout. Playback, album metadata, track ordering in the source array and source selection are unchanged.
- This remains an unpushed prepared change and needs real screenshot checks after approval.

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
- This is a prepared, unpushed fix pending completion of the earlier portable Windows build, so that build is not cancelled mid-packaging.

## Last.fm and FMHY implementation (2026-11-18)
- Audited real FMHY-referenced open-source players and existing Harbor Last.fm/MusicBrainz/ListenBrainz support. See `docs/music-ecosystem-references.md`.
- Corrected the native Last.fm threshold: track updates now send when actually listened for >=50% or four minutes, not only on EOF, and <=30-second recordings are excluded. Skip/seek behavior remains protected by real listened-time accounting and one-send flag.
- Added an optional Last.fm Now Playing event after mpv FileLoaded when the account is connected; no credentials transmitted without authorization. The optional presence failure must not affect audio.
- This change needs a *new* Windows preview; the previous successful artifact predates it.
