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

test("artist portrait remains responsive without replacing Harbor detail view", () => {
  const css = read("src/views/music/music-detail.css");
  assert.match(css, /music-detail-hero:has\(\.music-detail-art\.rounded-full\)/);
  assert.match(css, /@container \(max-width: 620px\)/);
});
