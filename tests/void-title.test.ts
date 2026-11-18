import test from "node:test";
import assert from "node:assert/strict";
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
