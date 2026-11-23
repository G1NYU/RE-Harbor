# Harbor Community v1.0.4 Beta Performance Baseline

## Source

- Release: `HarborCommunity/Harbor@v1.0.4-beta`
- Release commit: `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`
- Base: `base/harborcommunity-v1.0.4-beta`
- Branch: `build/harborcommunity-v1.0.4-beta-performance-clean`
- Review: https://github.com/G1NYU/RE-Harbor/pull/19

## Applied Upstream Changes

- PR #3: startup and optional-feature performance
- PR #4: theme-engine and scrolling performance
- PR #8: TV artwork identity stability

Only the three PR #8 files were copied from its branch.
The unrelated later upstream beta commits were excluded.

The base contains no native VOID styling or custom Music redesign.
Refract and Music are those provided by the original Community release.
The experimental portrait poster cache PR #18 is excluded.

## Windows Preview

- Config: `src-tauri/tauri.community-performance-preview.conf.json`
- App ID: `app.harbor.communityperformancepreview`
- Workflow: `.github/workflows/harborcommunity-performance-windows-preview.yml`
- Original Community Harbor app ID: `app.harbor`

The updater is disabled and the preview app data is isolated.
This is an unsigned portable test, not an official release.
The optional Capstan extension runtime is not included.
External authentication callbacks may differ from Community Harbor.

## Verification

The source changes were compared with the upstream release.
Code Quality and Windows compilation must pass before distribution.
CI cannot verify real Windows poster scrolling or media playback.

## Acceptance

1. Extract the complete Windows preview archive.
2. Run `harbor.exe` without copying files into an existing installation.
3. Test portrait posters in the default Community Harbor theme.
4. Scroll down, return to old posters, and check for flashing.
5. Apply the original VOID `.harborstyle` through Settings.
6. Repeat the same poster test, then test Music and Refract.

Do not publish as a production installer before user acceptance.
Preserve the previous VOID build and the official Harbor install.
