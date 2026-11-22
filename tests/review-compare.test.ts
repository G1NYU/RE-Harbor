import assert from "node:assert/strict";
import test from "node:test";
import { reviewPresence, sharedTerms, uniqueTerms } from "@/lib/social/review-compare";

/**
 * The comparison is only allowed to report words that literally appear in both reviews.
 * These tests are the guard against it drifting into invented opinion analysis.
 */

test("only words present in both reviews are reported", () => {
  const mine = "The cinematography is gorgeous and the ending lands.";
  const theirs = "Gorgeous cinematography, but the ending drags.";
  const shared = sharedTerms(mine, theirs);
  assert.deepEqual(shared.sort(), ["cinematography", "ending", "gorgeous"]);
  for (const term of shared) {
    assert.ok(mine.toLowerCase().includes(term), `${term} appears in my review`);
    assert.ok(theirs.toLowerCase().includes(term), `${term} appears in their review`);
  }
});

test("one-sided wording never leaks into the shared list", () => {
  const shared = sharedTerms("A brutal, patient western.", "A patient and quiet western.");
  assert.deepEqual(shared.sort(), ["patient", "western"]);
});

test("unique terms describe textual differences without labeling either opinion", () => {
  assert.deepEqual(uniqueTerms("patient western ending", "patient quiet western"), ["ending"]);
  assert.deepEqual(uniqueTerms("patient quiet western", "patient western ending"), ["quiet"]);
  assert.deepEqual(uniqueTerms("only my review", null), []);
});

test("punctuation, casing and plurals do not create false matches", () => {
  const shared = sharedTerms("Ending! Ending? ENDING.", "the ending");
  assert.deepEqual(shared, ["ending"]);
});

test("filler, short words and bare numbers are excluded", () => {
  const shared = sharedTerms("This was a 10 really good film", "This was a 10 really good film");
  assert.deepEqual(shared, ["film"]);
});

test("the shared list is bounded and stable", () => {
  const mine = "alpha beta gamma delta epsilon zeta eta theta";
  const theirs = "theta eta zeta epsilon delta gamma beta alpha";
  const first = sharedTerms(mine, theirs, 3);
  const second = sharedTerms(mine, theirs, 3);
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
});

test("empty reviews produce no comparison at all", () => {
  assert.deepEqual(sharedTerms("", "anything at all"), []);
  assert.deepEqual(sharedTerms("anything at all", null), []);
  assert.deepEqual(sharedTerms(undefined, undefined), []);
});

test("presence reports exactly who wrote a review", () => {
  assert.equal(reviewPresence("text", "text"), "both");
  assert.equal(reviewPresence("text", null), "mine-only");
  assert.equal(reviewPresence(null, "text"), "theirs-only");
  assert.equal(reviewPresence("", "   "), "neither");
});
