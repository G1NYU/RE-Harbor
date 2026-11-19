import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("VOID routes account and sidebar shortcuts to the upper-right away from dock", () => {
  const side = read("src/chrome/sidebar.tsx");
  const top = read("src/chrome/topbar.tsx");
  assert.match(side, /\(!voidNative \|\| editing\) && \(/);
  assert.match(side, /!voidNative && \(locked \?/);
  assert.match(top, /data-void-topbar-utilities/);
  assert.match(top, /data-void-topbar-account/);
  assert.match(top, /AccountMenu trigger="avatar" placement="down"/);
  assert.match(top, /update\(\{ sidebarCollapsed: !settings\.sidebarCollapsed \}\)/);
  assert.match(top, /enterBigPicture\(\)/);
});

test("VOID selection fades instead of drawing a bordered rectangle", () => {
  const css = read("src/void-native.css");
  assert.match(css, /button\[data-harbor-nav\]\[data-active\] \{/);
  assert.match(css, /background: color-mix\(in srgb, var\(--void-raised\)/);
  assert.match(css, /content: none;/);
  assert.match(css, /border-color: transparent/);
});

test("search and explore are spacious; source selector does not crowd input", () => {
  const view = read("src/views/music.tsx");
  const mast = read("src/components/music/music-mast.tsx");
  const css = read("src/views/music/music-page-system.css");
  assert.match(view, /tab === "explore"\) \? "max-w-none"/);
  assert.match(mast, /data-music-mast-form/);
  assert.match(mast, /data-music-mast-scope/);
  assert.match(css, /\[data-music-mast-form\] \{/);
  assert.match(css, /\[data-music-tab="explore"\]/);
});

test("artist source and MusicBrainz links remain grouped and clickable", () => {
  const page = read("src/components/music/music-artist-overview.tsx");
  assert.match(page, /music-artist-resources/);
  assert.match(page, /data-musicbrainz-link/);
  assert.match(page, /<MusicArtistExtras profile=\{profile\}/);
  assert.match(page, /musicbrainz\.org\/artist/);
});

test("top ten numbers are small in-poster overlays without changing other themes", () => {
  const card = read("src/components/top-rank-card.tsx");
  const css = read("src/void-native.css");
  assert.equal((card.match(/data-void-rank-number/g) ?? []).length, 2);
  assert.equal((card.match(/data-void-rank-card/g) ?? []).length, 2);
  assert.match(css, /\[data-void-rank-card\] \[data-void-rank-number\]/);
  assert.match(css, /\[data-void-rank-card\] > span\[aria-hidden\]/);
});

test("VOID connecting mark is flat and has no enclosing panel", () => {
  const source = read("src/components/harbor-loader.tsx");
  assert.match(source, /data-void-default-artwork/);
  assert.match(source, /border-0 bg-transparent/);
  assert.doesNotMatch(source, /rounded-xl border border-\[#313244\]/);
});

test("original VOID grouped right-aligned sidebar preserves arbitrary tab moves", () => {
  const side = read("src/chrome/sidebar.tsx");
  const css = read("src/void-native.css");
  assert.match(side, /data-void-sidebar-groups=\{grouped \|\| undefined\}/);
  assert.match(side, /voidNavSectionBoundaries/);
  assert.match(side, /data-void-nav-section/);
  assert.match(side, /visibleOrder=\{visibleOrder\}/);
  assert.match(side, /SidebarPositionEditor/);
  assert.match(css, /flex-direction: row-reverse/);
  assert.match(css, /content: none/);
});
