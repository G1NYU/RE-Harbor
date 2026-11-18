import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("VOID Listen is a new workspace, not a wrapped Harbor MusicView", () => {
  const app = read("src/App.tsx");
  const screen = read("src/views/void-studio/music-workspace.tsx");
  assert.match(app, /voidShell\s*\?\s*\(\s*<VoidStudioMusic/);
  assert.match(screen, /export function VoidStudioMusic/);
  assert.match(screen, /data-void-studio-music/);
  assert.match(screen, /void-studio-music-context/);
  assert.match(screen, /void-studio-music-story/);
  assert.match(screen, /void-studio-music-detail/);
  assert.match(screen, /void-studio-track-list/);
  assert.doesNotMatch(screen, /<MusicView\b|<MusicDetail\b|<MusicCatalogRow\b/);
});

test("provider data and track interactions use the existing Harbor engine", () => {
  const screen = read("src/views/void-studio/music-workspace.tsx");
  for (const requirement of [
    "useMusicData", "searchTyped", "albumTracks", "artistRows", "artistTop",
    "catalogPlaylistTracks", "stationTracks", "MusicConnectionsProvider",
    "MusicSourcePickerProvider", "MusicPlaylistPickerProvider",
    "openSourcePicker", "enqueueMusic", "openPlaylistPicker", "toggleMusicPlayback",
  ]) assert.ok(screen.includes(requirement), `Missing music behavior ${requirement}`);
});

test("new listening deck is a full transport with a real queue", () => {
  const deck = read("src/chrome/void/void-listening-deck.tsx");
  const old = read("src/App.tsx");
  assert.match(deck, /musicUpcoming\(state\.queue, state\.queueIndex/);
  assert.match(deck, /seekMusic\(Number\(/);
  assert.match(deck, /setMusicVolume\(Number\(/);
  assert.match(deck, /void-listening-cover/);
  assert.match(deck, /void-listening-credit/);
  assert.match(deck, /void-listening-up-next/);
  assert.match(old, /!voidShell && <MusicDock/);
});

test("new content and music deck remain separate layout columns", () => {
  const studio = read("src/chrome/void/void-studio.css");
  const music = read("src/views/void-studio/void-studio-music.css");
  assert.match(studio, /\[data-void-route="music"\] > \[data-void-view-root\]/);
  assert.match(studio, /width: calc\(100% - var\(--void03-deck-width\)\)/);
  assert.match(music, /grid-template-columns: clamp\(198px, 15vw, 248px\) minmax\(0, 1fr\)/);
  assert.match(music, /void-studio-music-story-art/);
  assert.match(music, /void-studio-music-detail-copy/);
  assert.doesNotMatch(studio + music, /backdrop-filter\s*:|filter\s*:\s*blur\(|@keyframes/);
});

test("global navigation remains functional without permanent nav rail", () => {
  const header = read("src/chrome/void/void-spaces-header.tsx");
  const app = read("src/App.tsx");
  assert.match(header, /const GROUPS/);
  assert.match(header, /\bid !== "settings"\b/);
  assert.match(header, /entry\?\.gated/);
  assert.match(header, /AccountMenu/);
  assert.match(app, /<VoidSpacesHeader/);
  assert.doesNotMatch(app, /<VoidRail\b/);
});
