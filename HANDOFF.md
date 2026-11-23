# HANDOFF — Harbor Community 1.0.4 beta performance baseline

Date: 2026-11-23

## Goal
Use the **exact** public Community Harbor release `HarborCommunity/Harbor@v1.0.4-beta` as the base and apply only upstream PRs 3, 4 and 8. This is a separate baseline to diagnose flickering/reloading portrait posters in the older custom VOID application. The original, external VOID Glass `.harborstyle` may be applied via Settings **after** confirming Community Harbor's default theme works.

## Repository, branches and provenance
- Source: `HarborCommunity/Harbor`, immutable release tag `v1.0.4-beta` at `c4f0242a65e9a0b57da4f877e0df8b8f360aab06`.
- Clean comparison branch: `G1NYU/RE-Harbor@base/harborcommunity-v1.0.4-beta` (points to original release commit).
- Performance source branch: `G1NYU/RE-Harbor@build/harborcommunity-v1.0.4-beta-performance-clean`.
- PR #3 (https://github.com/HarborCommunity/Harbor/pull/3): precise four-commit release-tag patch set, integrated as `4233293a3fcf0b2d26bc08c4199c9354aa8fe8be`.
- PR #4 (https://github.com/HarborCommunity/Harbor/pull/4): precise five-commit theme-engine patch set, integrated as `31cfebf3a56f8a9c56772c6c46732a11fdddd57c`.
- PR #8 (https://github.com/HarborCommunity/Harbor/pull/8): only its **three PR-changed files**, integrated as `07bc19fdc72a1c1f6921abb43a3b6226f0f6ad28`; the extra 14 commits on its current branch are excluded.
- Review: https://github.com/G1NYU/RE-Harbor/pull/19.
- Git compare after those three commits: 36 changed paths relative to the release tag; no native VOID, custom Music, modified Refract, poster warm-cache PR #18, or themes.
- Upstream Community Music and Refract from the release are retained without our customizations.

## Isolated Windows test build
- Tauri override: `src-tauri/tauri.community-performance-preview.conf.json`.
- Preview identity: `app.harbor.communityperformancepreview`. Does not overwrite or use the official `app.harbor` / VOID app data or update channel.
- Updater endpoints are disabled; preview deep-link scheme is isolated; this may affect external authentication callback behavior compared with the official install.
- Portable archive should include the real compiled `harbor.exe`, media tools, native library, and SHA-256 manifest. It is unsigned and **not** an official release.
- Workflow: `.github/workflows/harborcommunity-performance-windows-preview.yml`. Code Quality PR check must pass and Windows build artifact verification must succeed before distributing.
- Do not silently substitute the official v1.0.4-beta release installer; it does **not** contain these three PR patches.

## Acceptance and next steps
1. Download verified Windows portable artifact from the workflow when successful; extract the complete ZIP (do not mix with other Harbor/VOID program files).
2. In default **Community Harbor theme**, compare initial portrait poster loading, horizontal and vertical scrolling, and scroll back to previously seen posters. Record whether pixels flash, sources change, or actual downloads recur.
3. Apply original VOID Glass `.harborstyle` through **Settings** and repeat exactly the same scenario. This clean build must **not** import native VOID styling.
4. Smoke test startup, media playback, default Music, and Refract from the original Community release.
5. If any check fails, inspect the exact workflow logs and change only the failing code/packaging. Do not mark the build production-ready or publish an unsigned installer as an official release.

## Risks
- No local Windows GUI/manual scrolling verification can be performed by CI.
- External updater disabled by design; authentication deep links use a distinct scheme.
- The portable test does not use Shipyard's managed feature installer.
- Old VOID branch and installer remain intact as rollbacks.
