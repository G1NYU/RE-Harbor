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
