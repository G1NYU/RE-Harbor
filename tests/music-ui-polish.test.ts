import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("music topbar becomes opaque on scroll and sticky title stays below it", () => {
  const bar = read("src/chrome/topbar.tsx");
  const sticky = read("src/components/music/music-sticky-title.css");
  assert.ok(bar.includes('view === "music" || settings.topbarAppearance === "transparent" || settings.topbarScrollBlur'));
  assert.ok(bar.includes('background: view === "music" || settings.topbarAppearance === "transparent"'));
  assert.ok(bar.includes('background: view === "music"'));
  assert.match(sticky, /inset-block-start: 80px/);
});

test("unwanted full-width tab divider is removed, active underline kept", () => {
  const tabs = read("src/components/music/music-tabs.tsx");
  assert.doesNotMatch(tabs, /gap-\[22px\] border-b/);
  assert.match(tabs, /bottom-\[-1px\].*bg-accent/);
});

test("track grids and placeholders align with at most two columns", () => {
  const grid = read("src/components/music/music-track-grid.tsx");
  const css = read("src/views/music/music-page-system.css");
  assert.equal(grid.match(/music-track-grid-results/g)?.length, 2);
  assert.doesNotMatch(grid, /xl:grid-cols-3/);
  assert.match(grid, /xl:grid-cols-2/);
  assert.match(css, /min-height: 70px/);
  assert.match(css, /scroll-padding-block-end/);
});

test("bottom bar exposes explicit expansion and retains native transport", () => {
  const dock = read("src/components/music/music-dock.tsx");
  assert.match(dock, /data-music-dock-expand/);
  assert.match(dock, /aria-label=\{t\("music\.now\.expand"\)\}/);
  assert.match(dock, /setExpanded\(true\)/);
  for (const action of ["toggleMusicPlayback", "nextMusic", "previousMusic", "toggleMusicShuffle"]) {
    assert.ok(dock.includes(action));
  }
});

test("artist detail becomes full-width with a spacious editorial header and two-column tracks", () => {
  const view = read("src/views/music.tsx");
  const detail = read("src/views/music/music-detail.tsx");
  const css = read("src/views/music/music-detail.css");
  assert.match(view, /detail\?\.item\.kind === "artist" \|\| detail\?\.item\.kind === "album" \? "max-w-none"/);
  assert.match(detail, /data-music-artist=\{item\.kind === "artist"/);
  assert.match(detail, /music-artist-eyebrow/);
  assert.match(css, /grid-template-areas: "art identity" "art stats"/);
  assert.match(css, /\.music-detail-track-list \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 850px\)/);
});
test("full-width music dock expands from its non-control area into the real player", () => {
  const dock = read("src/components/music/music-dock.tsx");
  const now = read("src/components/music/music-now-playing.tsx");
  assert.ok(dock.includes('insetInlineStart: topKind === "games" ? inset : 0'));
  assert.match(dock, /onClick=\{\(event\) => \{/);
  assert.match(dock, /target\.closest\('button, a, input, select, textarea/);
  assert.match(dock, /setQueueOpen\(false\);\s*setExpanded\(true\);/);
  assert.match(dock, /<MusicNowPlaying/);
  for (const region of ["music-now-artwork", "music-now-tabs", "music-now-panel"]) {
    assert.ok(now.includes(region), "the expanded player lost " + region);
  }
});

test("album details use a wide image-and-metadata header with faded right/bottom edges", () => {
  const view = read("src/views/music.tsx");
  const detail = read("src/views/music/music-detail.tsx");
  const css = read("src/views/music/music-detail.css");
  assert.match(view, /detail\?\.item\.kind === "album" \? "max-w-none"/);
  assert.match(detail, /data-music-album=\{item\.kind === "album"/);
  assert.match(detail, /music-album-eyebrow/);
  assert.match(css, /\.music-detail-page\[data-music-album\] \.music-detail-hero::before/);
  assert.match(css, /mask-image: radial-gradient/);
  assert.match(css, /filter: blur\(10px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 770px\)/);
});
