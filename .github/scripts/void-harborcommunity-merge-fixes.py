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
now_text = now_text[:-4] + "});\n"
now_path.write_text(now_text, encoding="utf-8")
print("Restored v1.0.4 Now Playing memoized helper components")
