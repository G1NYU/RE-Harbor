import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dock = readFileSync("src/components/music/music-dock.tsx", "utf8");
const now = readFileSync("src/components/music/music-now-playing.tsx", "utf8");
const css = readFileSync("src/components/music/music-premium.css", "utf8");

test("dedicated styling stays scoped to music components", () => {
  assert.match(dock, /data-music-dock\s+data-music-premium/);
  assert.match(now, /className="music-now-playing"\s+data-music-premium/);
  assert.match(dock, /import "\.\/music-premium\.css"/);
  assert.ok(css.includes("[data-music-premium]"));
  assert.ok(css.includes(".music-now-playing[data-music-premium]"));
});

test("roomier dock still announces its new height through existing clearance contract", () => {
  assert.match(dock, /const DOCK_HEIGHT = 88/);
  assert.match(dock, /setProperty\("--harbor-music-dock"/);
  assert.match(dock, /--harbor-dock-gap/);
  assert.match(css, /inline-size:\s*56px;\s*block-size:\s*56px/);
});

test("premium controls retain the actual keyboard-accessible transport", () => {
  for (const action of [
    "toggleMusicPlayback", "previousMusic", "nextMusic",
    "toggleMusicShuffle", "cycleMusicRepeat", "seekMusic",
  ]) {
    assert.ok(dock.includes(action), "missing existing transport: " + action);
  }
  assert.match(dock, /type="range"/);
  assert.match(dock, /aria-valuetext/);
  assert.match(css, /focus-visible/);
});

test("phase two does not introduce expensive visual effects or external assets", () => {
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/);
  assert.doesNotMatch(css, /backdrop-filter\s*:/);
  assert.doesNotMatch(css, /url\s*\(/);
  assert.match(css, /prefers-reduced-motion/);
});
