# Harbor Music — focused recovery handoff

Updated: 2026-11-18

## Approved baseline
- Repository: `G1NYU/RE-Harbor`
- Branch: `feature/harbor-music-polish`
- Exact starting commit: `9c89330eff5a08a208eaa4ac62017b8ac027cede` from `feature/void-refract-preview`.
- This baseline passed Windows portable-preview workflow [44052102329](https://github.com/G1NYU/RE-Harbor/actions/runs/44052102329) and VOID/Refract validation [44052102318](https://github.com/G1NYU/RE-Harbor/actions/runs/44052102318).
- Previous full-app redesign remains preserved on `feature/void-03-workspaces`. Do not merge, cherry-pick, reset or delete it as part of this recovery.

## Scope — only two targeted corrections
1. Bottom music player bar: fix the layout and interaction issues indicated in the user's earlier screenshots with red annotations. Keep the Harbor-based layout and existing playback/queue/source behavior.
2. Artist / track page: correct the too-small artist hero, cramped track typography/rows and any overlapping toolbar elements, following those same red annotations.

Do not redesign app navigation, replace the player engine, rework music sources, change the interface architecture, or introduce VOID 03 into this branch. Preserve the working Refract integration, other media sections, and installed Harbor.

## Blocker and verification
- The exact red-annotated screenshot pixels are not available in the current conversation context. Do not guess their precise measurements or element positions; request reattachment before pixel-matched UI edits.
- Baseline code and branch were verified read-only; no corrective UI changes or new build have yet been validated on this recovery branch.
- After targeted fixes: run frontend typecheck, relevant music/VOID/Refract regressions, desktop layout screenshots at narrow and normal widths, and a portable Windows preview. Inspect actual screenshots before accepting.

## Harbor music screenshot corrections — staged (2026-11-18)
- User supplied seven annotated 2048×1124 captures. Issues identified: transparent header clashing with scroll content/breadcrumbs; full-width tab separator; small, hard-to-find player expansion; three cramped search track columns; artist portrait/readability and fixed dock clearance.
- Candidate changes preserve the original Harbor music architecture and behavior: solid on-scroll Music header even for transparent topbar appearance, title sticky below 80px chrome, active-tab underline only, two track columns/70px row spacing, responsive enlarged artist portrait, explicit accessible now-playing button and scroll clearance.
- The review commit is **not attached to this branch yet**, pending explicit push approval. Verification: structural regression included; project typecheck and Windows screenshots must run after approval.
- Do not merge VOID 02/03 or affect core music sources, playback engine, Refract or other category pages.

- Final review: the same transparent toolbar collision is visible above movie/poster rows. Enable opaque scroll backing for transparent topbar appearance globally; the content-density and sticky title changes remain Music-only.

## Corrected interpretation of screenshot request
- The bottom bar must be full-bleed across the application/window, not start after Harbor's sidebar. The user must be able to open the actual `MusicNowPlaying` environment by clicking unused dock surface, while play, seek, volume, menus, artist and track links retain their own actions. The visible expansion button remains as a keyboard-accessible alternative.
- Artist detail (Masayoshi Takanaka reference) must be a true editorial redesign: full available content width, prominent rectangular artwork, balanced typography/actions/metadata, clear section controls and two desktop track columns that collapse responsively.
- The old draft's small circular-portrait resizing was insufficient and has been replaced. The rest of Harbor remains on the stable baseline.
- Exact implementation is staged as an **unpublished review commit**. Full test/build/render validation cannot be claimed before a branch push.
