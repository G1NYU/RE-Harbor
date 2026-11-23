# Handoff — Community Harbor 1.0.4 nested-row visibility experiment

## Baseline and scope

- Source: `G1NYU/RE-Harbor@base/harborcommunity-v1.0.4-beta`, exact Community tag commit `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`.
- Proposed branch: `fix/harborcommunity-1.0.4-nested-row-culling` (not created/pushed yet).
- This patch changes **only** the nested `content-visibility` rule and adds a source-level regression test.
- No native VOID CSS, Music redesign, Refract modifications, upstream performance PRs, native cache changes, or build workflows.

## Evidence and hypothesis

- `LazyMount` already sets inline `contentVisibility: "auto"`.
- `.harbor-row-shell` also uses `content-visibility: auto`; the near-row rule repeats it.
- On November 23, Momolabsz reported far fewer empty cards when overriding inner row visibility to `visible`, including under CPU throttling.
- Hypothesis: duplicate culling delays the first paint of cards until rows are onscreen. The patch preserves outer culling and changes only the inner row inside `LazyMount`.

## Verification

- Local Node source-level regression check using representative release-source fixture: red before, green after.
- Repository-wide lint, TypeScript, unit tests, Windows packaging, UI performance benchmarks, and frame-pacing tests: **not run**.
- No GitHub commit, PR, push, installer, or deployment has been made from this patch.

## Next steps

1. Apply on a new branch from `base/harborcommunity-v1.0.4-beta` once authorized.
2. Run repo-wide Code Quality CI and an isolated unsigned Windows preview build.
3. A/B test in the actual app at equal resolution, scrolling speed, CPU load, and 60/180/260 Hz where supported; record empty-card count and missed frames.
4. Check Movies → Anime → Movies (and Home return) independently; this CSS change is **not** a confirmed fix for page-return blanking.
5. Keep the patch isolated; only experiment with queue pacing and poster source retention after the A/B result.
