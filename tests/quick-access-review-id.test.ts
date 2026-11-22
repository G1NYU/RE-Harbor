import assert from "node:assert/strict";
import test from "node:test";
import type { PublicRating } from "@/lib/ratings/types";
import { findAuthorReviewId, reviewFromRating } from "@/lib/social/quick-reviews";
import { titleRatingFrom } from "@/lib/social/review-rank";

const rating: PublicRating = {
  itemKey: "tt123",
  mediaType: "movie",
  score: 8,
  title: "Example",
  at: "2026-11-16T12:00:00Z",
};

test("legacy ratings without a review ID do not invent one", () => {
  const review = reviewFromRating(rating);
  assert.equal(review.id, undefined);
});

test("both rating adapters preserve the same canonical ID from rating history", () => {
  for (const input of [
    { ...rating, id: "review-42" },
    { ...rating, reviewId: "review-42" },
  ]) {
    assert.equal(reviewFromRating(input).id, "review-42");
    assert.equal(titleRatingFrom(input, { handle: "friend" })?.reviewId, "review-42");
  }
});

test("resolving an engagement ID uses an exact author and title lookup", async (t) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    urls.push(new URL(String(input)));
    return Response.json({
      items: [{ id: "review-42", contentType: "movie", contentId: "tt123" }],
      total: 1,
    });
  });

  assert.equal(await findAuthorReviewId("friend", rating), "review-42");
  assert.equal(urls.length, 1);
  assert.match(urls[0].pathname, /\/social\/u\/friend\/reviews$/);
  assert.equal(urls[0].searchParams.get("contentType"), "movie");
  assert.equal(urls[0].searchParams.get("contentId"), "tt123");
  assert.equal(urls[0].searchParams.get("limit"), "1");
});

test("a visibility denial never falls through to another lookup", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "not_found" }, { status: 404 }),
  );
  await assert.rejects(findAuthorReviewId("private-profile", rating), /not_found/);
  assert.equal(fetchMock.mock.callCount(), 1);
});
