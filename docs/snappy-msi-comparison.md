# Harbor snappiness A/B build

This branch layers a narrowly scoped performance pass on top of `feature/refract-native-sync-2026` and does not merge into the main `beta-branch`.

## Changes

1. Start the native music database initialization concurrently; do not block React mounting on its completion. Music restoration still completes and publishes asynchronously, and the main window can show the UI first.
2. Move the 4.2 MB awards table out of the entry bundle. Load and index the table after the WebView is idle (with a bounded fallback timeout). The desktop Detail and Person views subscribe to the awards version so deferred results appear automatically. Other subscribed awards widgets already update.
3. Stop the parked, inactive Home view from scanning/reconciling Stremio library in the background. Opening Home immediately runs the refresh.
4. Rows below the viewport no longer mount their first six poster cards eagerly; near-viewport rows still promote their first six cards, while the existing child observer lazy-loads the rest. The `alwaysActive` rail override remains untouched.

## What did NOT change

- No quality reduction for poster images, transparency, custom Harborstyle themes, CSS glass/blur, or video playback.
- No disabling the WebView2 GPU, no change to libmpv/audio renderers, no cache wipes.
- No new authentication provider or bundled credentials.
- No modification of the original Harbor install: test MSI is a separately identified app with automatic updates disabled.

## Comparison checklist

Install the isolated MSI and use comparable account, theme, addons, and library data. Because the isolated application uses its own app ID, it may have separate settings and require sign-in.

1. Cold-start Harbor and the Snappy Test version three times each; observe splash-to-interactive time, not just splash duration.
2. Home: scroll past 15–20 rows and back; look for empty rows, delayed card reveals, unexpected focus jumps or image flashing.
3. Switch between Home, detail, person, anime and library views ten times; assess responsiveness on every return.
4. Confirm awards appear on home heroes, detail pages and person pages after they load.
5. Check music playback restoration after launch and switching profiles; ensure detached DJ window is unaffected.
6. Use the same VOID theme in both builds to compare animations and scroll stutter. For more meaningful profiling, compare Windows Task Manager GPU and WebView2 process CPU/memory.
7. Test with Refract key connected and disconnected to isolate effects of background tracker work.

## Deferred future experiments

- Opt-in _Reduced effects_ mode for expensive theme blur and background paint (not silently enabled).
- Additional UI data snapshots and render profiling for cards, provider refreshes and hover previews.
- GPU/driver and WebView2 runtime diagnostics; never disable hardware acceleration for regular users without evidence.
- Content visibility for entire below-fold rails only with reliable intrinsic sizes to avoid scrollbar jumps.

The optimized build must pass TypeScript and focused regression tests before an MSI is uploaded. It is a performance experiment until the Windows smoke test confirms that lazy card reveal and audio restore are sound.
