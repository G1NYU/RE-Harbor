import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { episodesFromCinemeta, mergeEpisodes } from "../src/views/void-studio/title-episodes.ts";

test("merging listings keeps native-only episodes and source video IDs", () => {
  const native = episodesFromCinemeta(
    [
      { season: 2, episode: 3, id: "provider:3", title: "Third" },
      { season: 1, episode: 1, id: "other" },
      { season: 2, episode: 1, id: "provider:1", title: "First" },
    ],
    2,
  );
  const localized = episodesFromCinemeta(
    [
      { season: 2, episode: 1, title: "Localized first" },
      { season: 2, episode: 2, title: "Second" },
    ],
    2,
  );
  const merged = mergeEpisodes(native, localized);
  assert.deepEqual(
    merged.map((e) => e.number),
    [1, 2, 3],
  );
  assert.equal(merged[0].play.videoId, "provider:1");
  assert.equal(merged[0].title, "Localized first");
  assert.equal(merged[2].play.videoId, "provider:3");
  assert.deepEqual(mergeEpisodes(native, []), native);
});

test("specials remain in season zero", () => {
  const entries = episodesFromCinemeta([{ season: 0, number: 3, id: "extra" }], 0);
  assert.equal(entries[0].play.season, 0);
  assert.equal(entries[0].play.episode, 3);
});


test("VOID title options stay in the new workspace until advanced compatibility is requested", () => {
  const title = readFileSync("src/views/void-studio/title-workspace.tsx", "utf8");
  const actions = readFileSync("src/views/void-studio/title-tools.tsx", "utf8");
  const detail = readFileSync("src/views/detail.tsx", "utf8");
  assert.match(title, /<VoidTitleTools/);
  assert.match(title, /onClick=\{\(\) => setToolsOpen\(true\)\}/);
  assert.doesNotMatch(title, /onClick=\{onTools\}/);
  assert.match(actions, /role="dialog" aria-modal="true"/);
  assert.match(actions, /event\.key === "Escape"/);
  assert.match(detail, /onChooseSource=\{\(\) => void smartPlay\(true\)\}/);
  assert.match(detail, /onDownload=\{\(\) => openPicker\(playMeta, undefined, \{ intent: "download" \}\)\}/);
  assert.match(detail, /onToggleWatched=\{markThisMovieWatched\}/);
  assert.match(detail, /onTools=\{\(\) => setShowTitleTools\(true\)\}/);
});


test("VOID source selection uses an independent stream board while other themes retain their picker", () => {
  const picker = readFileSync("src/views/play-picker.tsx", "utf8");
  const board = readFileSync("src/views/void-studio/void-source-board.tsx", "utf8");
  const css = readFileSync("src/views/void-studio/void-source-board.css", "utf8");
  assert.match(picker, /voidWorkspace && filteredPicker && filteredPicker\.all\.length > 0/);
  assert.match(picker, /<VoidSourceBoard/);
  assert.match(picker, /<StremioLayout/);
  assert.match(picker, /onPlay=\{playManually\}/);
  assert.match(picker, /downloadStateFor=\{\(stream\) =>/);
  assert.match(board, /matchesFacets\(stream, facets\)/);
  assert.match(board, /aria-label="Available sources"/);
  assert.match(board, /onManageFilters/);
  assert.doesNotMatch(css, /backdrop-filter\s*:|@keyframes|filter\s*:\s*blur\(/);
});


test("VOID title actions handle custom-list membership with profile-aware operations", () => {
  const actions = readFileSync("src/views/void-studio/title-tools.tsx", "utf8");
  const title = readFileSync("src/views/void-studio/title-workspace.tsx", "utf8");
  assert.match(actions, /useCustomLists\(\)/);
  assert.match(actions, /useListsContaining\(item\.id\)/);
  assert.match(actions, /captureMembershipProfile\(\)/);
  assert.match(actions, /setListMembership\(listId, item, present, profile\)/);
  assert.match(actions, /createListWithItem\(name, item, profile\)/);
  assert.match(title, /item=\{\{ id: meta\.id/);
});


test("VOID opens trailers directly without returning to the legacy title page", () => {
  const actions = readFileSync("src/views/void-studio/title-tools.tsx", "utf8");
  const page = readFileSync("src/views/detail.tsx", "utf8");
  const overlay = readFileSync("src/views/detail/trailer-overlay.tsx", "utf8");
  assert.match(actions, /hasTrailer &&/);
  assert.match(actions, /run\(onTrailer\)/);
  assert.match(page, /onTrailer=\{\(\) => setTrailerOpen\(true\)\}/);
  assert.match(page, /<TrailerOverlay[\s\S]*?voidMode/);
  assert.match(overlay, /data-void-trailer=\{voidMode \|\| undefined\}/);
  assert.match(overlay, /data-tv-modal-close/);
  assert.match(overlay, /backdropFilter: voidMode \|\| isMacDesktop\(\) \? "none"/);
});
