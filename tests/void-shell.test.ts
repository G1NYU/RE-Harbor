import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("VOID 03 replaces the Harbor rail with horizontal media spaces", () => {
  const app = read("src/App.tsx");
  const header = read("src/chrome/void/void-spaces-header.tsx");
  assert.match(app, /<VoidSpacesHeader\s*\/>/);
  assert.doesNotMatch(app, /<VoidRail\s*\/>/);
  assert.doesNotMatch(app, /<VoidCommandBar\s*\/>/);
  assert.match(header, /const SPACES:/);
  for (const space of ["Start", "Watch", "Listen", "Read", "Play", "Live"]) {
    assert.ok(header.includes(`label: "${space}"`), `Missing ${space} space`);
  }
});

test("VOID 03 preserves route discovery and parental PIN checks", () => {
  const header = read("src/chrome/void/void-spaces-header.tsx");
  assert.match(header, /useSidebarNavigation/);
  assert.match(header, /entry\.gated/);
  assert.match(header, /locked/);
  assert.match(header, /ParentalPinModal/);
  assert.match(header, /AccountMenu/);
  assert.match(header, /setOpen: openSearch/);
  assert.match(header, /DownloadsButton/);
  assert.match(header, /GROUPS/);
});

test("VOID 03 uses an actual side listening deck rather than the Harbor bottom dock", () => {
  const app = read("src/App.tsx");
  const deck = read("src/chrome/void/void-listening-deck.tsx");
  assert.match(app, /installFeatures\.music && !voidShell && <MusicDock\s*\/>/);
  assert.match(app, /<VoidListeningDeck\s*\/>/);
  for (const interaction of ["seekMusic", "setMusicVolume", "toggleMusicPlayback", "musicUpcoming", "cycleMusicRepeat", "toggleMusicShuffle", "toggleMusicLiked"]) {
    assert.ok(deck.includes(interaction), `Player missing ${interaction}`);
  }
  assert.match(deck, /void-listening-float/);
  assert.match(deck, /void-listening-deck-large/);
});

test("VOID 03 reserves side-player space and compiles its own flat shell", () => {
  const css = read("src/chrome/void/void-studio.css");
  const main = read("src/main.tsx");
  assert.match(css, /\.void-studio-frame\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /data-void-route="music"/);
  assert.match(css, /width:\s*calc\(100% - var\(--void03-deck-width\)\)/);
  assert.match(css, /\.void-listening-deck/);
  assert.match(main, /import "@\/chrome\/void\/void-studio\.css"/);
  assert.doesNotMatch(css, /backdrop-filter\s*:|filter\s*:\s*blur\(|@keyframes/);
});

test("VOID 03 keeps the existing media views and native sources mounted", () => {
  const app = read("src/App.tsx");
  assert.match(app, /const voidShell = !kid && !preview && !bigPicture/);
  assert.match(app, /<MusicView/);
  assert.match(app, /!voidShell &&[\s\S]+<Sidebar\s*\/>/);
  assert.match(app, /<PlayerView/);
});
