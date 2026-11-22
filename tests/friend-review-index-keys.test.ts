import assert from "node:assert/strict";
import test from "node:test";
import { markKeyForItem } from "@/lib/social/friend-review-index";

/**
 * Poster friend rows are keyed by title identity. The key used to be the itemKey alone,
 * so a movie and a show sharing an id (or a numeric key reused across media types) showed
 * one title's friends on another title's poster. These assertions pin the pair.
 */

test("a title's key carries its media type, so equal item keys do not collide", () => {
  assert.notEqual(markKeyForItem("movie", "tt0903747"), markKeyForItem("tv", "tt0903747"));
  assert.notEqual(markKeyForItem("tv", "1396"), markKeyForItem("anime", "1396"));
});

test("the same pair always produces the same key", () => {
  assert.equal(markKeyForItem("movie", "603"), markKeyForItem("movie", "603"));
  assert.equal(markKeyForItem("movie", "603"), markKeyForItem("movie", " 603 "));
  assert.equal(markKeyForItem("movie", "603"), markKeyForItem(" movie ", "603"));
});

test("an empty media type or item key cannot produce a lookup key", () => {
  assert.equal(markKeyForItem("", "603"), "|603");
  assert.equal(markKeyForItem("movie", ""), "movie|");
  // Neither equals a real title's key, so an incomplete rating can never be shown on a poster.
  assert.notEqual(markKeyForItem("", "603"), markKeyForItem("movie", "603"));
});
