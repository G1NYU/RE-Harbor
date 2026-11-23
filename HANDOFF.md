# Handoff — Community Harbor 1.0.4 nested-row visibility experiment

## Baseline and scope

- Source: `G1NYU/RE-Harbor@base/harborcommunity-v1.0.4-beta`, exact Community tag commit `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`.
- Active branch: `fix/harborcommunity-1.0.4-nested-row-culling` at `fb3eae0e227140ad8a413b67370ea28496e4facd` (approved code patch). Draft PR: https://github.com/G1NYU/RE-Harbor/pull/20.
- Application code change: only the nested `content-visibility` rule and its source-level regression test; build-only workflow is `.github/workflows/harborcommunity-culling-windows-preview.yml` (commit `3f155733977093be5258ee4c2bac0338a348cc1e`).
- No native VOID CSS, Music redesign, Refract modifications, upstream performance PRs, or native cache changes. The workflow generates a separate Tauri identity (`app.harbor.communitycullingpreview`), disables updater, checks its four-file scope and uploads an unsigned Windows portable preview without release publishing.

## Evidence and hypothesis

- `LazyMount` already sets inline `contentVisibility: "auto"`.
- `.harbor-row-shell` also uses `content-visibility: auto`; the near-row rule repeats it.
- On November 23, Momolabsz reported far fewer empty cards when overriding inner row visibility to `visible`, including under CPU throttling.
- Hypothesis: duplicate culling delays the first paint of cards until rows are onscreen. The patch preserves outer culling and changes only the inner row inside `LazyMount`.

## Verification

- Local Node source-level regression check using representative release-source fixture: red before, green after.
- Code Quality PR check: https://github.com/G1NYU/RE-Harbor/actions/runs/45143832358 — **success** (both Frontend and Native); previous source-only check 45141557520 also succeeded.
- Approved application patch commit `fb3eae0e227140ad8a413b67370ea28496e4facd`; workflow commit `3f155733977093be5258ee4c2bac0338a348cc1e`. Both were pushed and diffs verified. Windows preview workflow run: https://github.com/G1NYU/RE-Harbor/actions/runs/45143822273 — **still in progress at last check (Rust/Tauri compile)**, no uploaded artifact yet. No installer, deployment or visual performance benchmark has been made.

## Next steps

1. Confirm Windows preview run 45143822273 completes successfully and that its uploaded portable payload passes bundled executable/media-integrity checks; do not merge draft PR #20 without native Windows A/B testing.
2. Once a verified artifact exists, download the `harbor-community-v1.0.4-beta-nested-culling-windows-x64` artifact from the run, extract the complete ZIP and run `harbor.exe`. The independent app profile keeps existing Harbor/VOID untouched.
3. A/B test in the actual app at equal resolution, scrolling speed, CPU load, and 60/180/260 Hz where supported; record empty-card count and missed frames.
4. Check Movies → Anime → Movies (and Home return) independently; this CSS change is **not** a confirmed fix for page-return blanking.
5. Keep the patch isolated; only experiment with queue pacing and poster source retention after the A/B result.
