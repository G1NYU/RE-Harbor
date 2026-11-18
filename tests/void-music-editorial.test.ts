import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("VOID command bar is inside the shell's normal flex flow, not above media", () => {
  const app = read("src/App.tsx");
  const css = read("src/chrome/void/void-shell.css");
  const body = app.indexOf('className={`relative flex min-h-0 min-w-0 flex-1 flex-col');
  const command = app.indexOf("<VoidCommandBar />", body);
  const home = app.indexOf("{homeAlive && (", body);
  assert.ok(body >= 0 && command > body && command < home);
  assert.match(css, /\.void-command-bar\s*\{[^}]*position:\s*relative/);
  assert.doesNotMatch(css, /\.void-command-bar\s*\{[^}]*position:\s*fixed/);
});

test("album and artist detail are separately composed, not a reskinned generic header", () => {
  const detail = read("src/views/music/music-detail.tsx");
  const music = read("src/views/music.tsx");
  assert.match(detail, /void-music-detail-scenery/);
  assert.match(detail, /void-music-hero-body/);
  assert.match(detail, /void-music-detail-overline/);
  assert.match(detail, /data-void-music-kind=\{item\.kind\}/);
  assert.match(music, /\(!voidEdition \|\| !detail\) &&/);
  assert.match(music, /data-void-music-context/);
});

test("artist search uses large full-width rows with real queue and playlist handlers", () => {
  const search = read("src/views/music/music-search-panel.tsx");
  const row = read("src/components/music/music-track-row.tsx");
  assert.match(search, /voidEdition\s*\?\s*\(/);
  assert.match(search, /className="void-music-search-track-list"/);
  assert.match(search, /<MusicTrackRow[\s\S]*?editorial/);
  assert.match(search, /onAddToQueue=\{\(\) => enqueueMusic\(track\)\}/);
  assert.match(search, /onAddToPlaylist=\{\(\) => openPlaylistPicker\(track\)\}/);
  assert.match(row, /data-void-track-row=\{editorial \|\| undefined\}/);
});

test("Music retains source-aware search and playback expand functionality", () => {
  const mast = read("src/components/music/music-mast.tsx");
  const bar = read("src/chrome/void/void-command-bar.tsx");
  const dock = read("src/components/music/music-dock.tsx");
  assert.match(mast, /edition\?: "void"/);
  assert.match(bar, /topKind !== "music"/);
  assert.match(dock, /data-void-music-expand/);
  assert.match(dock, /setExpanded\(\(open\) => !open\)/);
});

test("editorial visuals are scoped to VOID and do not rely on costly runtime effects", () => {
  const css = read("src/chrome/void/void-music-editorial.css");
  assert.match(css, /\[data-void-shell\] \[data-music-view\]/);
  assert.match(css, /\.void-music-detail-scenery/);
  assert.match(css, /\.void-music-search-track-list/);
  assert.match(css, /@media \(max-width: 670px\)/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur\(|filter:\s*blur\(|@keyframes/);
});

test("Music home composes a current-track hero with a playable recent queue", () => {
  const home = read("src/views/music/music-listening-home.tsx");
  const css = read("src/chrome/void/void-music-editorial.css");
  assert.match(home, /className="void-music-feature-queue"/);
  assert.match(home, /className="void-music-feature-queue-list"/);
  assert.match(home, /onClick=\{\(\) => play\(track\)\}/);
  assert.match(home, /music-room-shortcuts/);
  assert.match(css, /\.void-music-feature-queue-track/);
  assert.match(css, /\.music-room-shortcuts > button/);
});
