import assert from "node:assert/strict";
import test from "node:test";
import {
  posterCardCacheKey,
  recallPosterChoice,
  recallPosterSize,
  rememberPosterChoice,
  rememberPosterSize,
} from "../src/lib/poster-warm-cache.ts";

test("regular poster remounts reuse the last successfully displayed source", () => {
  const identity = posterCardCacheKey([
    "tt0111161",
    "movie",
    "https://art.invalid/original.jpg",
    "provider-key-a",
    "https://art.invalid",
    "en",
    ["en", "original"],
    ["rpdb", "posterService"],
  ]);
  assert.equal(recallPosterChoice(identity), undefined);
  rememberPosterChoice(identity, "https://art.invalid/final.jpg");
  assert.equal(recallPosterChoice(identity), "https://art.invalid/final.jpg");
  // An upgrade to the preferred image is what the next remount should retain.
  rememberPosterChoice(identity, "https://art.invalid/localized.jpg");
  assert.equal(recallPosterChoice(identity), "https://art.invalid/localized.jpg");
});

test("changes to source art or provider preferences do not inherit stale posters", () => {
  const config = ["tt0111162", "movie", "https://art.invalid/a.jpg", "provider-a", "", "en"];
  const original = posterCardCacheKey(config);
  rememberPosterChoice(original, "https://art.invalid/a.jpg");
  assert.equal(recallPosterChoice(posterCardCacheKey(config)), "https://art.invalid/a.jpg");
  const changedArtwork = [...config];
  changedArtwork[2] = "https://art.invalid/b.jpg";
  const changedProvider = [...config];
  changedProvider[3] = "provider-b";
  const changedLanguage = [...config];
  changedLanguage[5] = "fr";
  const changedTitle = [...config];
  changedTitle[0] = "tt0999999";
  for (const changed of [changedArtwork, changedProvider, changedLanguage, changedTitle]) {
    assert.equal(recallPosterChoice(posterCardCacheKey(changed)), undefined);
  }
});

test("a remounted card starts at its measured image rung without downshifting", () => {
  const key = "portrait|1|https://art.invalid/poster-123.jpg";
  assert.equal(recallPosterSize(key), 0);
  rememberPosterSize(key, 354);
  assert.equal(recallPosterSize(key), 354);
  rememberPosterSize(key, 200);
  assert.equal(recallPosterSize(key), 354);
  rememberPosterSize(key, 500);
  assert.equal(recallPosterSize(key), 500);
  rememberPosterSize(key, Number.NaN);
  assert.equal(recallPosterSize(key), 500);
  assert.equal(recallPosterSize("portrait|1.5|https://art.invalid/poster-123.jpg"), 0);
});
