import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const musicBands = read("src/views/music/music-personal-bands.tsx");
const musicCards = read("src/views/music/music-recents.css");
const oldHero = read("src/views/music/music-home.css");
const stream = read("src/views/play-picker.tsx");
const streamCss = read("src/void-stream-picker.css");
const switcher = read("src/components/player/stream-switcher.tsx");
const screensaver = read("src/components/screensaver/screensaver-clock.tsx");
const artworkSettings = read("src/views/settings/theme-panel/startup-artwork.tsx");
const loader = read("src/components/harbor-loader.tsx");
const sounds = read("src/lib/sfx.ts");
const defaults = read("src/lib/settings/defaults.ts");

test("recents shelf loads its own responsive styling rather than the legacy hero", () => {
  assert.match(musicBands, /import "\.\/music-recents\.css"/);
  assert.match(musicBands, /className="music-quick-grid"/);
  assert.match(musicCards, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(musicCards, /\.music-quick-art img\s*\{/);
  assert.match(musicCards, /object-fit: cover/);
  assert.match(musicCards, /max-width: 560px/);
  assert.doesNotMatch(musicBands, /import "\.\/music-home\.css"/);
  assert.match(oldHero, /\.music-quick-grid/); // Regression origin: avoid importing this old hero again.
  assert.doesNotMatch(musicCards, /(?:backdrop-filter|@keyframes|filter:\s*blur)/);
});

test("initial stream picker and in-player stream switcher share VOID surfaces", () => {
  assert.match(stream, /data-stream-picker/);
  assert.match(switcher, /data-stream-switcher-panel/);
  assert.match(streamCss, /data-stream-layout/);
  assert.match(streamCss, /data-stream-row/);
  assert.match(streamCss, /data-stream-primary/);
  assert.match(streamCss, /data-stream-picker-content/);
  assert.doesNotMatch(streamCss, /backdrop-filter/);
  assert.doesNotMatch(switcher, /backdrop-blur-md|backdrop-blur-xl/);
});

test("native VOID screensaver and startup fallback retain user-selected artwork", () => {
  assert.match(screensaver, /data-void-screensaver-brand/);
  assert.match(screensaver, /settings\.theme\.preset === "cool-grey"/);
  assert.match(artworkSettings, /<CustomArtwork role=\{role\}/);
  assert.match(artworkSettings, /<VoidDefaultArtwork size="sm"/);
  assert.match(loader, /data-void-default-artwork/);
  assert.match(loader, /<CustomArtwork role="loading"/);
});

test("VOID sound effects remain opt-in and do not auto-enable at startup", () => {
  assert.match(sounds, /"cinematic" \| "void"/);
  assert.match(sounds, /this\.activeTheme === "void"/);
  assert.match(defaults, /soundTheme: "none"/);
});
