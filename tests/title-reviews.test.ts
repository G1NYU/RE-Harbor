import assert from "node:assert/strict";
import test from "node:test";
import type { PublicRating } from "@/lib/ratings/types";
import {
  commentQuotesTitle,
  mergeTitleRatings,
  pickTitleRating,
  sameTitle,
  sortTitleRatings,
  stackHandles,
  titleRatingFrom,
  type TitleRating,
} from "@/lib/social/review-rank";

const target = { itemKey: "tmdb:movie:809", mediaType: "movie" } as const;

function rating(over: Partial<PublicRating> = {}): PublicRating {
  return {
    itemKey: "tmdb:movie:809",
    mediaType: "movie",
    score: 8,
    title: "Shrek 2",
    at: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

function review(over: Partial<TitleRating> = {}): TitleRating {
  return {
    handle: "msg",
    alias: "Mohammed",
    itemKey: "tmdb:movie:809",
    mediaType: "movie",
    score: 8,
    review: "Good",
    at: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

test("a title is identified by item key and media type together", () => {
  assert.equal(sameTitle(target, { itemKey: "tmdb:movie:809", mediaType: "movie" }), true);
  assert.equal(sameTitle(target, { itemKey: "tmdb:movie:809", mediaType: "anime" }), false);
  assert.equal(sameTitle(target, { itemKey: "tmdb:movie:808", mediaType: "movie" }), false);
});

test("ratings for the same id under another media type never merge", () => {
  const merged = mergeTitleRatings(
    [
      review({ handle: "msg" }),
      review({ handle: "naif", itemKey: "tmdb:movie:809", mediaType: "anime" }),
    ],
    target,
  );
  assert.deepEqual(
    merged.map((r) => r.handle),
    ["msg"],
  );
});

test("a person appears once, with their newest rating of the title", () => {
  const merged = mergeTitleRatings(
    [
      review({ at: "2026-09-01T00:00:00.000Z", score: 3, review: "Later changed" }),
      review({ at: "2026-10-05T00:00:00.000Z", score: 9, review: "Rewatched" }),
    ],
    target,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].score, 9);
  assert.equal(merged[0].review, "Rewatched");
});

test("the viewer is never listed against their own title", () => {
  const merged = mergeTitleRatings([review({ handle: "MSG" })], target, "msg");
  assert.deepEqual(merged, []);
});

test("merging orders newest first", () => {
  const merged = mergeTitleRatings(
    [
      review({ handle: "old", at: "2026-01-01T00:00:00.000Z" }),
      review({ handle: "new", at: "2026-11-01T00:00:00.000Z" }),
    ],
    target,
  );
  assert.deepEqual(
    merged.map((r) => r.handle),
    ["new", "old"],
  );
});

test("a rating without review text still counts, with the review unset", () => {
  const row = titleRatingFrom(rating({ review: "   " }), { handle: "naif" });
  assert.ok(row);
  assert.equal(row.review, undefined);
  assert.equal(row.alias, "naif");
  assert.equal(row.score, 8);
});

test("review text is trimmed and spoilers survive", () => {
  const row = titleRatingFrom(rating({ review: "  Loved it  ", spoiler: true }), {
    handle: "msg",
    alias: "Mohammed",
    avatarUrl: "https://example.test/a.png",
    verified: true,
  });
  assert.ok(row);
  assert.equal(row.review, "Loved it");
  assert.equal(row.spoiler, true);
  assert.equal(row.verified, true);
  assert.equal(row.avatarUrl, "https://example.test/a.png");
});

test("only the newest rating for exactly this title is picked", () => {
  const picked = pickTitleRating(
    [
      rating({ at: "2026-01-01T00:00:00.000Z", score: 4 }),
      rating({ at: "2026-05-01T00:00:00.000Z", score: 9 }),
      rating({ itemKey: "tmdb:movie:603", at: "2026-09-01T00:00:00.000Z", score: 1 }),
    ],
    target,
  );
  assert.equal(picked?.score, 9);
});

test("sorting uses rating and date, never anything invented", () => {
  const list = [
    review({ handle: "a", score: 5, at: "2026-01-01T00:00:00.000Z" }),
    review({ handle: "b", score: 9, at: "2026-02-01T00:00:00.000Z" }),
    review({ handle: "c", score: 9, at: "2026-03-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    sortTitleRatings(list, "highest").map((r) => r.handle),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    sortTitleRatings(list, "lowest").map((r) => r.handle),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    sortTitleRatings(list, "newest").map((r) => r.handle),
    ["c", "b", "a"],
  );
});

test("the avatar stack holds distinct people and respects its cap", () => {
  const handles = stackHandles(
    [
      review({ handle: "a" }),
      review({ handle: "A" }),
      review({ handle: "b" }),
      review({ handle: "c" }),
      review({ handle: "d" }),
    ],
    3,
  );
  assert.deepEqual(handles, ["a", "b", "c"]);
});

test("only comments that quote this exact title belong to the review", () => {
  const quoted = "[[rq:@msg|tmdb:movie:809|movie|8]] Great take";
  assert.equal(commentQuotesTitle(quoted, target), true);
  assert.equal(commentQuotesTitle("[[rq:@msg|tmdb:movie:603|movie|8]] Wrong film", target), false);
  assert.equal(commentQuotesTitle("[[rq:@msg|tmdb:movie:809|anime|8]] Wrong type", target), false);
  assert.equal(commentQuotesTitle("Just a comment", target), false);
});
