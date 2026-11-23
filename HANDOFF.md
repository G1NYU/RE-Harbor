# Handoff — Community Harbor 1.0.4 nested-row visibility experiment

## Baseline and scope

- Source: `G1NYU/RE-Harbor@base/harborcommunity-v1.0.4-beta`, exact Community tag commit `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`.
- Active branch: `fix/harborcommunity-1.0.4-nested-row-culling` at `fb3eae0e227140ad8a413b67370ea28496e4facd` (approved code patch). Draft PR: https://github.com/G1NYU/RE-Harbor/pull/20.
- This patch changes **only** the nested `content-visibility` rule and adds a source-level regression test.
- No native VOID CSS, Music redesign, Refract modifications, upstream performance PRs, native cache changes, or build workflows.

## Evidence and hypothesis

- `LazyMount` already sets inline `contentVisibility: "auto"`.
- `.harbor-row-shell` also uses `content-visibility: auto`; the near-row rule repeats it.
- On November 23, Momolabsz reported far fewer empty cards when overriding inner row visibility to `visible`, including under CPU throttling.
- Hypothesis: duplicate culling delays the first paint of cards until rows are onscreen. The patch preserves outer culling and changes only the inner row inside `LazyMount`.

## Verification

- Local Node source-level regression check using representative release-source fixture: red before, green after.
- Code Quality PR check: https://github.com/G1NYU/RE-Harbor/actions/runs/45140928876 (Native passed; Frontend format/lint and typecheck passed; frontend tests still in progress at last inspection).
- The exact approved three-file patch was pushed and its diff verified (1 commit, +65/-0). No installer, deployment or visual performance benchmark has been made.

## Next steps

1. Confirm final Code Quality results; do not merge draft PR #20 without native Windows A/B testing.
2. Prepare an isolated unsigned Windows portable preview. The current base build workflows do not upload a usable portable executable; adding a new workflow/config requires separate approval before pushing.
3. A/B test in the actual app at equal resolution, scrolling speed, CPU load, and 60/180/260 Hz where supported; record empty-card count and missed frames.
4. Check Movies → Anime → Movies (and Home return) independently; this CSS change is **not** a confirmed fix for page-return blanking.
5. Keep the patch isolated; only experiment with queue pacing and poster source retention after the A/B result.
