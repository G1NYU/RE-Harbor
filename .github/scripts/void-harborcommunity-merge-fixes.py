#!/usr/bin/env python3
"""CI-only, fail-closed repairs for JSX overlap in the Harbor 1.0.4 trial merge.

This script MUST run only after the pinned Git merge -X ours. It repairs structural
duplication from overlapping VOID and upstream JSX hunks; it is not an application
source file, nor is the resulting trial merge automatically committed or published.
"""
from pathlib import Path
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]

def replace_once(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"Expected one occurrence, found {text.count(old)}: {old[:90]!r}")
    return text.replace(old, new, 1)

def dock(text: str) -> str:
    void_start = '  return (\n    <aside\n      key="music-dock-bar"'
    upstream_start = '      <aside\n        key="music-dock-bar"'
    if text.count(void_start) != 1 or text.count(upstream_start) != 1:
        raise RuntimeError("Unexpected dock JSX structure")
    first = text.index(void_start)
    second = text.index(upstream_start, first)
    text = text[:first] + '  return (\n    <>\n' + text[second:]
    text = replace_once(
        text, '        data-music-dock\n        data-auto-hidden=',
        '        data-music-dock\n        data-music-premium\n        data-auto-hidden=',
    )
    text = replace_once(
        text, '            insetInlineStart: inset,\n',
        '            insetInlineStart: topKind === "games" ? inset : 0,\n',
    )
    label = '        aria-label={t(expanded ? "music.now.title" : "music.player")}\n'
    click = '''        onClick={(event) => {
          if (expanded) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest('button, a, input, select, textarea, [role="button"], [role="slider"], [data-music-dock-seek], [data-music-dock-alert]')) return;
          setQueueOpen(false);
          setExpanded(true);
        }}
'''
    text = replace_once(text, label, label + click)
    return replace_once(
        text, '            inset={inset}\n',
        '            inset={topKind === "games" ? inset : 0}\n',
    )

def gif(text: str) -> str:
    first = '    <div className="music-miku-copy">'
    second = '      <div className="music-miku-copy">'
    if first not in text or second not in text:
        raise RuntimeError("Unexpected GIF settings JSX structure")
    a = text.index(first)
    b = text.index(second, a + len(first))
    text = text[:a] + text[b:]
    marker = '        <p>{t("music.gif.timingHelp")}</p>\n'
    extra = '''        {asset?.frames && (
          <p className="music-gif-frame-count" role="status">
            {t("music.gif.frameCount", { count: asset.frames.frames.length })}
            {asset.frames.frames.length < 2 && ` · ${t("music.gif.static")}`}
          </p>
        )}
        {!appearance.visualizerMotion && (
          <p className="music-motion-reduced">{t("music.motion.reduced")}</p>
        )}
'''
    text = replace_once(text, marker, marker + extra)
    return replace_once(text, '    </section>\n  );\n}', '    </section>;\n}')

def miku(text: str) -> str:
    return replace_once(text, '    </div>\n  );\n}', '    </div>\n  </div>;\n}')

def now_playing(text: str) -> str:
    duplicated_art = '''            {video && <MusicVideoFullscreen track={current} />}
            {appearance.levels && !speaker.active && current.mediaKind !== "video" && (
              <div className="music-now-levels" data-now-levels>
                <ArtworkLevels track={current} enabled={player.phase !== "resolving" && !isMusicVideoActive()} />
              </div>
            )}
          </div>
          <div className="music-now-content">'''
    text = replace_once(text, duplicated_art, '          <div className="music-now-content">')
    duplicated_title = '''              </button>
              <MusicNowTitle key={current.id} title={display.title} />
              <div className="music-now-artist">'''
    if text.count(duplicated_title) != 1:
        raise RuntimeError("Unexpected Now Playing title overlap")
    a = text.index(duplicated_title)
    b = text.index('              <div className="music-now-actions">', a)
    text = text[:a] + '              </button>\n            )}\n' + text[b:]
    return replace_once(text, '  );\n});\n', '  );\n}\n')

def startup_artwork(text: str) -> str:
    return replace_once(
        text, '      </div>\n    </SettingRow>\n  );',
        '      </div>\n    </div>\n  </SettingRow>;',
    )

FIXES = {
    'src/components/music/music-dock.tsx': dock,
    'src/components/music/music-gif-settings.tsx': gif,
    'src/components/music/music-miku-visualizer.tsx': miku,
    'src/components/music/music-now-playing.tsx': now_playing,
    'src/views/settings/theme-panel/startup-artwork.tsx': startup_artwork,
}

for relative, repair in FIXES.items():
    path = ROOT / relative
    before = path.read_text(encoding="utf-8")
    after = repair(before)
    if after == before:
        raise RuntimeError(f"No change in {relative}; refusing to continue")
    path.write_text(after, encoding="utf-8")
    print(f"Resolved merge overlap: {relative}")

# The v1.0.4 upstream logic is the authoritative implementation of these shared
# structures (including Nuvio profile scoping and Refract watchlist operations).
# Copy it from the pinned commit, not a moving branch. This is a TRIAL ONLY.
upstream_commit = os.environ.get("OFFICIAL_EXPECTED", "")
if upstream_commit != "c4f0242a65e9a0b57da4f877e0df8b8f360aab06":
    raise RuntimeError("Unexpected upstream SHA")
upstream_paths = [
    "src/lib/active-profile-id.ts",
    "src/lib/watchlist.ts",
    "src/views/library/watchlist-tab.tsx",
    "src/lib/settings/types.ts",
    "tests/refract-library-removal.test.mjs",
    "tests/refract-api.test.mjs",
    "src/lib/i18n/locales/ar.ts",
    "src/lib/i18n/locales/de.ts",
    "src/lib/i18n/locales/es.ts",
    "src/lib/i18n/locales/fr.ts",
    "src/lib/i18n/locales/hi.ts",
    "src/lib/i18n/locales/id.ts",
    "src/lib/i18n/locales/it.ts",
]
for relative in upstream_paths:
    data = subprocess.check_output(
        ["git", "show", f"{upstream_commit}:{relative}"], cwd=ROOT
    ).decode("utf-8")
    if relative == "src/lib/settings/types.ts":
        data = replace_once(
            data,
            'soundTheme: "none" | "glass" | "modern" | "retro" | "cinematic";',
            'soundTheme: "none" | "glass" | "modern" | "retro" | "cinematic" | "void";',
        )
    (ROOT / relative).write_text(data, encoding="utf-8")
    print(f"Selected reviewed official v1.0.4 implementation: {relative}")

# Restore official 1.0.4's extracted subcomponents and memoized rendering while
# keeping the VOID audio-visualizer caption and the merged, repaired JSX body.
relative = "src/components/music/music-now-playing.tsx"
now_path = ROOT / relative
now_text = now_path.read_text(encoding="utf-8")
upstream = subprocess.check_output(
    ["git", "show", f"{upstream_commit}:{relative}"], cwd=ROOT
).decode("utf-8")
caption_start = now_text.index("/** Keep 20Hz meter re-renders scoped")
now_start = now_text.index("const NOW_LIKE_SPOKES =")
body_start = now_text.index("export function MusicNowPlaying({")
caption = now_text[caption_start:body_start]
upstream_start = upstream.index("const NOW_LIKE_SPOKES =")
upstream_body = upstream.index("export const MusicNowPlaying = memo(function MusicNowPlaying({")
now_text = (
    now_text[:now_start]
    + upstream[upstream_start:upstream_body]
    + caption
    + now_text[body_start:]
)
now_text = replace_once(
    now_text,
    "export function MusicNowPlaying({",
    "export const MusicNowPlaying = memo(function MusicNowPlaying({",
)
if not now_text.endswith("  );\n}\n"):
    raise RuntimeError("Unexpected Now Playing export closing")
now_text = now_text[:-2] + "});\n"
now_path.write_text(now_text, encoding="utf-8")
print("Restored v1.0.4 Now Playing memoized helper components")

# Merge-only semantic corrections: retain VOID components while restoring
# v1.0.4's interface contracts and modern event handling. Fail closed on drift.
def write_fix(relative, fix):
    target = ROOT / relative
    before = target.read_text(encoding="utf-8")
    after = fix(before)
    if after == before:
        raise RuntimeError(f"No semantic correction applied to {relative}")
    target.write_text(after, encoding="utf-8")
    print(f"Reconciled {relative}")


def fix_music_queue(text):
    text = replace_once(
        text, 'useState, type DragEvent } from "react"',
        'useState, type PointerEvent as ReactPointerEvent } from "react"',
    )
    text = replace_once(
        text,
        '''      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (draggable) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
''',
        "",
    )
    return replace_once(text, '      onDrop={onDrop}\n', "")


def fix_music_dock(text):
    text = replace_once(
        text,
        'import { useMusicAppearance } from "@/lib/music/appearance";',
        'import { useMusicAppearance, useMusicArtworkColor } from "@/lib/music/appearance";',
    )
    text = replace_once(
        text,
        '  const { profile: recording, display } = useRecordingProfile(player.current);\n',
        '  const { profile: recording, display } = useRecordingProfile(player.current);\n'
        '  const artworkColor = useMusicArtworkColor(display?.artwork, appearance.artworkColors);\n',
    )
    return replace_once(
        text, '  return (\n    <>\n      <aside\n',
        '''  return (
    <>
      {autoHideAllowed && autoHidden && (
        <div
          data-music-dock-reveal
          className="music-dock-reveal-zone"
          style={{
            insetInlineStart: topKind === "games" ? inset : 0,
            insetInlineEnd: 0,
            height: MUSIC_DOCK_REVEAL_ZONE_PX,
            bottom: "var(--harbor-viewport-bottom, 0px)",
          }}
          onPointerEnter={showAutoHiddenDock}
          onPointerMove={showAutoHiddenDock}
        />
      )}
      <aside
''',
    )


def fix_now_playing_meter(text):
    return replace_once(
        text,
        '''  const meter = useMusicAudioMeter(
    current,
    Boolean(
      current &&
      player.phase !== "resolving" &&
      panel === "signal" &&
      !isMusicVideoActive() &&
      !speaker.active,
    ),
  );
''', "",
    )


def fix_topbar(text):
    text = replace_once(
        text,
        '''  const scrollBlur =
    !chromeHidden &&
    view !== "settings" &&
    settings.topbarScrollBlur &&
    settings.topbarAppearance !== "transparent";''',
        '''  const scrollBlur =
    !chromeHidden &&
    view !== "settings" &&
    (view === "music" || settings.topbarScrollBlur || settings.topbarAppearance === "transparent");''',
    )
    return replace_once(text, 'opacity: scrolled ? 1 : 0,', 'opacity: 0,')


def fix_anime_hero(text):
    return replace_once(text, 'import { HeroBackdrop } from "./hero-backdrop";\n', "")


def fix_appearance(text):
    return replace_once(text, 'visualizerMotion: false, immersive: false };',
        'visualizerMotion: false, immersive: false, theatre: false };')


def fix_nav_edit(text):
    return replace_once(text, 'import { useSettings } from "@/lib/settings";\n',
        'import { useSettings } from "@/lib/settings";\n'
        'import { useInstallFeatures } from "@/lib/features/install";\n')


def fix_anime_view(text):
    if text.count('usePinnedCatalogRows("anime")') != 1 or 'import { usePinnedCatalogRows }' in text:
        raise RuntimeError("Unexpected Anime pinned catalog hook state")
    return 'import { usePinnedCatalogRows } from "./home/hooks/use-pinned-rows";\n' + text


def fix_tab_registry(text):
    return replace_once(text, 'import stremioLogo from "@/assets/stremio.png";\n',
        'import stremioLogo from "@/assets/stremio.png";\n'
        'import nuvioLogo from "@/assets/nuvio.png";\n')


def fix_play_picker(text):
    return replace_once(text, 'ref={mainRef}', 'ref={setMainRef}')


def fix_main(text):
    original = subprocess.check_output(
        ["git", "show", f"{upstream_commit}:src/main.tsx"], cwd=ROOT
    ).decode("utf-8")
    start = original.index('  if (themes.timedOut || themes.failed) markBootFallback("themes");')
    end = original.index('  // Retry queued Refract watches only from the regular app window.', start)
    segment = original[start:end]
    if 'secretsUnavailable' not in segment:
        raise RuntimeError("Official boot-health segment was unexpectedly missing")
    return replace_once(
        text, '  // Refract\'s retry queue is owned by the main application, never a player overlay.',
        segment + '  // Refract\'s retry queue is owned by the main application, never a player overlay.',
    )


def fix_startup_artwork(_old):
    text = subprocess.check_output(
        ["git", "show", f"{upstream_commit}:src/views/settings/theme-panel/startup-artwork.tsx"],
        cwd=ROOT
    ).decode("utf-8")
    text = replace_once(text,
        'import { HarborLoader } from "@/components/harbor-loader";',
        'import { HarborLoader, VoidDefaultArtwork } from "@/components/harbor-loader";')
    text = replace_once(text, 'import { saveArtwork } from "@/lib/custom-artwork-store";\n',
        'import { saveArtwork } from "@/lib/custom-artwork-store";\n'
        'import { useSettings } from "@/lib/settings";\n')
    text = replace_once(text,
        '    choice = useCustomArtwork(role);\n',
        '    choice = useCustomArtwork(role);\n'
        '  const { settings } = useSettings();\n'
        '  const voidNative = settings.theme.preset === "cool-grey";\n')
    text = replace_once(text,
        'fallback={\n              role === "loading" ? (',
        'fallback={\n              voidNative ? (\n'
        '                <VoidDefaultArtwork size="sm" />\n'
        '              ) : role === "loading" ? (')
    return replace_once(text, '{choice?.name ?? t("artwork.original")}',
        '{choice?.name ?? (voidNative ? "VOID default" : t("artwork.original"))}')


for relative, repair in [
    ("src/chrome/nav-edit.tsx", fix_nav_edit),
    ("src/chrome/topbar.tsx", fix_topbar),
    ("src/components/anime-hero.tsx", fix_anime_hero),
    ("src/components/music/music-dock.tsx", fix_music_dock),
    ("src/components/music/music-now-playing.tsx", fix_now_playing_meter),
    ("src/components/music/music-queue.tsx", fix_music_queue),
    ("src/lib/music/appearance.ts", fix_appearance),
    ("src/main.tsx", fix_main),
    ("src/views/anime.tsx", fix_anime_view),
    ("src/views/play-picker.tsx", fix_play_picker),
    ("src/views/settings/tab-registry.ts", fix_tab_registry),
    ("src/views/settings/theme-panel/startup-artwork.tsx", fix_startup_artwork),
]:
    write_fix(relative, repair)

## Harbor 1.0.4 regression reconciliation
# Applied to a throwaway merge worktree only. Source copies are pinned to the
# already-verified tag, and every edited fixture still exercises real logic.
def official_file(relative: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{upstream_commit}:{relative}"], cwd=ROOT
    ).decode("utf-8")


# Prefer upstream's newer media-action graph. The three-way -X ours resolution
# otherwise runs two watched-event paths for a single manual anime action.
for relative in ("src/lib/media-context-actions.ts", "src/lib/i18n/locales/ui-fallback.ts"):
    target = ROOT / relative
    original = target.read_text(encoding="utf-8")
    resolved = official_file(relative)
    if original == resolved:
        raise RuntimeError(f"No upstream reconciliation required for {relative}")
    target.write_text(resolved, encoding="utf-8")
    print(f"Restored 1.0.4 source contract: {relative}")

# The 1.0.4 player now uses literal 'Caching'/'Cached' tooltip strings; ensure
# its English fallback covers both while localized translations are loaded.
fallback_path = ROOT / "src/lib/i18n/locales/ui-fallback.ts"
fallback = fallback_path.read_text(encoding="utf-8")
for term in ("Cached", "Caching"):
    if f'"{term}": "{term}"' in fallback:
        raise RuntimeError(f"Tooltip translation already exists: {term}")
fallback = replace_once(
    fallback,
    "};\n\nexport default uiFallback;\n",
    '  "Cached": "Cached",\n  "Caching": "Caching",\n};\n\nexport default uiFallback;\n',
)
fallback_path.write_text(fallback, encoding="utf-8")

# VOID's styling deliberately overrides the official dock, but it must retain
# native 1.0.4 reveal, reduced-motion and fixed Now Playing containment rules.
css_rel = "src/components/music/music-dock.css"
css = (ROOT / css_rel).read_text(encoding="utf-8")
official_css = official_file(css_rel)
marker = "/* Auto-hide the full dock beneath the viewport;"
if marker not in official_css or marker in css:
    raise RuntimeError("Unexpected music dock auto-hide CSS state")
css = css.rstrip() + "\n\n" + official_css[official_css.index(marker):]
old_entrance = "[data-music-dock]:not([data-music-dock-tab]) {"
new_entrance = "[data-music-dock]:where([data-entering]):not([data-music-dock-tab]) {"
if new_entrance not in css:
    css = replace_once(css, old_entrance, new_entrance)
(ROOT / css_rel).write_text(css, encoding="utf-8")
print("Preserved VOID dock appearance and restored official auto-hide/reduced-motion CSS")

# The original VOID hero had an unmeasured, duplicate HeroBackdrop component.
# Keep the existing VOID slider, manga actions, scrims and layout, but use the
# official shared component to reject low-resolution/failed artwork.
hero_rel = "src/components/anime-hero.tsx"
hero = (ROOT / hero_rel).read_text(encoding="utf-8")
hero = replace_once(
    hero,
    'import { useArtFallback } from "./anime-hero-art-fallback";\n',
    'import { useArtFallback } from "./anime-hero-art-fallback";\n'
    'import { HeroBackdrop } from "./hero-backdrop";\n',
)
hero = replace_once(
    hero,
    "<HeroBackdrop meta={m} />",
    '<HeroBackdrop\n'
    '                  url={m.background ?? m.poster ?? ""}\n'
    '                  fallbacks={m.poster ? [m.poster] : []}\n'
    '                  objectPosition={m.background ? "75% center" : "82% center"}\n'
    '                />',
)
start_hero = hero.index("function HeroBackdrop({ meta }: { meta: Meta }) {")
end_hero = hero.index("function HeroLogoImage(", start_hero)
hero = hero[:start_hero] + hero[end_hero:]
(ROOT / hero_rel).write_text(hero, encoding="utf-8")
print("Restored measured shared anime hero artwork without changing VOID layout")

# The navigation tests simulate the context module through an injected CommonJS
# loader. Supply the actual VOID order function instead of an identity stub so
# their navigation/parental-policy assertions remain meaningful.
navigation_tests = {
    "tests/context-menu-actor-scope.test.ts":
        "  const deps: Record<string, unknown> = {\n",
    "tests/context-reload.test.ts":
        "  const dependencies = {\n",
    "tests/player-settings-policy.test.ts":
        "  const deps: Record<string, any> = {\n",
}
for relative, anchor in navigation_tests.items():
    file = ROOT / relative
    src = file.read_text(encoding="utf-8")
    src = replace_once(
        src,
        'import test from "node:test";\n',
        'import test from "node:test";\n'
        'import { withVoidDefaultNavOrder } from "../src/chrome/void-sidebar-order.ts";\n',
    )
    src = replace_once(
        src,
        anchor,
        anchor + '    "./void-sidebar-order": { withVoidDefaultNavOrder },\n',
    )
    file.write_text(src, encoding="utf-8")
    print(f"Exercised real VOID sidebar order in navigation test fixture: {relative}")

# The VOID UI tests must tolerate line breaks added by 1.0.4's formatter; keep
# testing the same runtime DOM/CSS contracts rather than insisting on one layout.
write_fix("tests/music-void-ui.test.ts", lambda s: replace_once(
    s, r'/setProperty\("--harbor-music-dock"/',
    r'/setProperty\(\s*"--harbor-music-dock"/',
))
write_fix("tests/void-native-cohesion.test.ts", lambda s: replace_once(
    s, r'/<CustomArtwork role=\{role\}/',
    r'/<CustomArtwork\s+role=\{role\}/',
))

# Custom VOID intentionally replaces Harbor default's greyscale palette. Tray
# fallback assertions should guard that intentional palette rather than
# claiming that the official upstream default is still active.
def fix_tray_test(src: str) -> str:
    src = replace_once(src, '"oklch(0.18 0.004 260)"', '"#11111b"')
    src = replace_once(src, '"oklch(0.22 0.004 260)"', '"#181825"')
    return replace_once(
        src,
        '''    assert.equal(
      snapshots.at(-1)?.tokens["--tray-row-hover"],
      "oklch(0.27 0.004 260)",
      "the popup needs its own row highlight tone",
    );''',
        '''    assert.notEqual(
      snapshots.at(-1)?.tokens["--tray-row-hover"],
      snapshots.at(-1)?.tokens["--color-surface"],
      "the popup needs a row highlight distinct from its surface",
    );''',
    )
write_fix("tests/tray-menu-state.test.ts", fix_tray_test)
