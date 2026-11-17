import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const theme = readFileSync("src/lib/theme.ts", "utf8");
const nativeCss = readFileSync("src/void-native.css", "utf8");
const musicCss = readFileSync("src/components/music/music-premium.css", "utf8");
const sidebar = readFileSync("src/chrome/sidebar.tsx", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

test("Rebuild N is compiled into Harbor instead of a user theme injection", () => {
  assert.match(theme, /name: "VOID Native"/);
  assert.match(theme, /root\.dataset\.voidNative = theme\.preset === "cool-grey"/);
  assert.match(main, /import "@\/void-native\.css"/);
  assert.match(sidebar, /data-void-native-wordmark/);
  assert.match(nativeCss, /data-void-native="1"/);
});

test("all shared brand colors use neutral graphite and muted grey", () => {
  for (const color of ["#11111b", "#181825", "#6c7086", "#cdd6f4"]) {
    assert.ok(theme.includes(color), "missing Rebuild N color: " + color);
  }
  assert.match(musicCss, /--music-premium-accent: #6c7086/);
  assert.doesNotMatch(musicCss, /#89b4fa|#a5c8ff/i);
});

test("native chrome keeps hero artwork static, rather than remounting it", () => {
  assert.match(nativeCss, /harbor-hero-stage::after/);
  assert.match(nativeCss, /data-tv-hero-zone/);
  assert.match(nativeCss, /prefers-reduced-motion/);
  assert.doesNotMatch(nativeCss, /backdrop-filter\s*:/);
  assert.doesNotMatch(nativeCss, /url\s*\(/);
  assert.doesNotMatch(nativeCss, /@keyframes/);
});
