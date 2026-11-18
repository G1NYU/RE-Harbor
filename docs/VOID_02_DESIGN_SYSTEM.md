# VOID / Edition 02 — native application design system

Status: **implementation draft** on top of `feature/void-refract-preview`; not yet pushed or proven in a Windows build.

## Product identity

VOID is a new presentation layer backed by Harbor's existing data providers, playback system, source selectors, downloaded media, sync, Refract tracker and saved user settings. Do not reuse Harbor's sidebar/topbar composition. The first code batch makes the shell native React code, not an injected .harborstyle.

Design language: **seamless editorial utility**. The canvas is near-black violet; content is the primary surface, not a sequence of Material cards.

| Token | Color | Purpose |
|---|---|---|
| Canvas | `#11111b` | Continuous app surface |
| Surface | `#181825` | Context popover, hovered row, text field |
| Hover | `#242436` | Quiet input and navigation feedback |
| Text | `#cdd6f4` | Main typography |
| Muted | `#a6adc8` | Secondary metadata |
| Steel | `#9399b2` | Focus and progress |
| Accent | `#6c7086` | Icon accent, not blue or teal |

## Core composition — every category

1. **One canvas**. Category content fills the same visual surface as the chrome. No outer page panel, dividing lines, boxed hero or persistent drop shadow. Top utilities float above content without blocking scroll.
2. **Navigation is a place, not a list of buttons**. A narrow, persistent pictographic rail groups destinations by spacing. 24px static line icons and short labels; profile and Settings move out of the lower sidebar into the top utility area. Consistent icon stroke; no numbered navigation.
3. **Large first impression**. Media artwork occupies a dominant continuous backdrop or an intentional editorial stage. Static low-cost overlays improve text contrast without blur. Primary title: 44–78px on major detail pages, responsive and legible.
4. **Rows beat tiles for dense metadata**. Tracks, episodes, chapters, streams and downloads share 72–88px rows, left-aligned primary text (15–17px), clearly separated metadata, and actions that reveal without shifting layout. Posters, covers and metadata align on a shared grid.
5. **Functional drawers, not floating Material cards**. Queue, filters, account, downloads, source selection and notifications appear as anchored panels with flat graphite surfaces, 10–14px radii only when their shape matters; never multiple borders or nested card outlines.
6. **Focus and accessibility**. Keyboard focus receives a visible steel outline. Touch targets >= 40px. UI supports RTL text, reduced motion, no hover-only critical functionality, correct accessible labels and no hardcoded text replacements in reused core views.

## Category-specific compositions

| Category | Content-led pattern | Keep functional |
|---|---|---|
| Home / Discover | Large cinematic feature stage and asymmetric horizontal shelves | Continue Watching, filters, browsing, deep links |
| Movies | Wide artwork + editorial facts/action stack, source list as flat rows | Playback provider choice, trailer, watched/watchlist, downloads |
| Shows / Anime | Hero + season/episode timeline, playable progression | Episode numbering, sync, trackers and return navigation |
| Manga / Books | Readable typography, series art + chapter/volume rows | Plugin source identity, chapter reader, bookmarks |
| Music | Full-track artist artwork; big player; playlist/track tables without card borders | Library, Music videos, queue/next, albums, metadata |
| Games | Cover-led library, list/grid modes, progress and external links | Existing game services and download/status workflows |
| Live TV | Dense but comfortable channel EPG with persistent stream status | Source switching, guide navigation and channel favorites |
| Collections / Downloads | Clean lists with metadata and sort/filter affordances | Drag/reorder, batch actions, progress/status |
| Stream selector | Rows grouped by quality/provider, selected state by tint rather than borders | Caching, source info, keyboard shortcuts, retry/next |
| Settings / Refract | Two-level navigation with clear section hierarchy and roomy rows | Search, connection states, secure credentials, retry settings |

## Performance contract

- No runtime DOM mutation/injection, `.harborstyle` JS, continuous CSS animation or per-frame artwork recoloring.
- No `backdrop-filter` on scrollers and no poster element cloning; stable React keys are important for image caching.
- Limit re-rendered shells; do not reparent playback components or replace the existing MusicDock.
- Keep lazy-loaded category pages, existing routing/parental policy and feature flags.
- Test 1280x800, 1600x900, 1920x1080 and narrow window layouts, including focus/keyboard usage; compare frame pacing to the user's previously verified stable build.

## Delivery milestones

1. **Native shell** (this batch). `VoidRail`, `VoidCommandBar`, compiled `void-shell.css`; replace composition only for the VOID preset. Keep Harbor's original layouts as fallbacks and leave child media routes untouched. Verify profile/PIN/search/close and every category entry.
2. **Shared content primitives**. `VoidMediaHero`, `VoidMetadataRow`, `VoidActionStrip`, `VoidSheet` and proper viewport behavior. Replace old card-based structures natively, one media family at a time.
3. **Category rewrites**. Music artist/album, video details, source selection, manga/book/game detail, Settings/Refract. Each change requires playback and API regression checks.
4. **Refract update**. Port ONLY the upstream PR #103 diffs for queue/retry, HTTP 409, 404/422 and test coverage after comparing to the baseline. Do not mix in unrelated upstream changes.
5. **Installable Windows preview**. Use isolated Tauri app identity and real per-user NSIS install with disabled updater and no file associations/deep-link collisions, then verify install/uninstall and playback on Windows.

## Safety/implementation constraints

- Baseline: `G1NYU/RE-Harbor` `feature/void-refract-preview`, commit `9c89330eff5a08a208eaa4ac62017b8ac027cede`.
- No direct changes to official `Harborofficial/Harbor#103`, `main`, stable installers or deployed releases.
- This is intentionally an *incomplete visual rollout*: the new shell is a substantial first-class change, but Settings, source picker and individual category content are separate follow-up components and must not be represented as already redesigned.
