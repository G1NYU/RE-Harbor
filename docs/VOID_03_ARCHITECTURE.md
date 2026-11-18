# VOID 03 — From-scratch interface architecture

## Why another approach is required
The last two preview builds changed colors, fonts, navigation-rail sizing, artwork dimensions and some page layouts, but retained the Harbor hierarchy and bottom player. That is explicitly *not* the requested redesign. VOID keeps only the established Mocha/grey palette and bold typography, while the component topology is replaced.

## References actually inspected (2026-11-18)
- Sonora: https://github.com/sonorahq/sonora — separate UI, views, state, routing and music provider layers.
- Ronas IT Music Web App: https://dribbble.com/shots/24817070-Music-Web-App — editorial discovery with a right-hand currently-playing list.
- Behance music-player concept: https://www.behance.net/gallery/155925237/A-Music-Player-App-UI — full-artwork stage and dedicated queue/lyrics structure.
These are conceptual references, not designs/assets copied from the authors.

## New information architecture
- **Horizontal media spaces**: Start, Watch, Listen, Read, Play, Live.
- **All destinations**: an intentionally hidden-but-accessible route menu, including Library, Collections, Downloads, Calendar, Addons, Plugins and Settings.
- **Profiles and settings**: utility controls at the upper right, including parental PIN enforcement and existing account menu.
- **Listen**: independent right-side playback studio with album artwork, transport, volume, shuffle, repeat, favorite and true upcoming queue. The full-width bottom player is removed.
- **Other media**: a compact floating controller only while music is playing, so browsing other categories does not sacrifice space.
- **Content**: future Music, Watch, Read and Play workspaces must use original layouts, not Harbor's search/result/detail cards under different CSS. Artwork is the content structure; controls follow semantics.
- **Physical layout**: flat near-black surfaces, no in-app frosted glass, minimal separators, no blur/per-frame transforms, large artwork and generous type.
- **Data boundary**: preserve native Harbor playback, Refract, sources, navigational history, profiles and feature gates.

## Implemented in this branch (development only)
- `src/chrome/void/void-spaces-header.tsx`: new space navigation and all-destinations menu.
- `src/chrome/void/void-listening-deck.tsx`: new side-player and cross-category floating controller.
- `src/chrome/void/void-studio.css`: separately compiled structural layout.
- `src/App.tsx`: selects the new shell in VOID only and switches the old bottom dock off.
- `src/views/void-studio/music-workspace.tsx`: new media-specific content and state flows with original React markup, not a wrapper around `MusicView`.
- `src/views/void-studio/void-studio-music.css`: new Listening Room compositions.
- The original Harbor feature code remains available. This is **not yet feature-complete** and is **not a candidate installer**.

## Blockers before shipping
1. Complete the new independent Music home, source management, detail views, search, and library feature parity (initial new components now live); eliminate any fallback to legacy controls.
2. Replace legacy Home, Watch (Movies, Shows, Anime), Read (Manga/eBook), Play (Games), Live, Settings and Library views.
3. Ensure new player offers source recovery, casting, lyrics and all existing music settings, not just transport.
4. Add programmatic layout tests and inspect rendered UI at 960x600, 1280x800, 1600x900, ultrawide and RTL.
5. Verify TypeScript, playback, Refract PR #103 and installer behavior without releasing until real UI parity.

## No-go criteria
A screenshot that is visibly Harbor with replaced colors, a left stacked category rail, or a full-width bottom player fails this redesign. No new installer until the first-launch experience is unmistakably different.
