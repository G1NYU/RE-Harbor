import "./_localstorage-stub";
import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthResult } from "@/lib/theme-auth";
import {
  loadTitleRatingSummary,
  loadTitleReviewsWithMatches,
  invalidateTitleReviewCaches,
} from "@/lib/social/title-reviews";
import { getMutualMatch } from "@/lib/social/mutual-ratings";
import { prefetchHoverRatings } from "@/lib/social/hover-rating-prefetch";

test("hover preload shares its review requests and bundled matches with both review menus", async (t) => {
  applyAuthResult({
    token: "fixture-token",
    user: { id: "preload-viewer", handle: "viewer", username: "viewer" },
  });
  invalidateTitleReviewCaches();
  let reads = 0;
  const target = { mediaType: "movie", itemKey: "preload-fixture" } as const;
  const match = { score: 79, count: 12 };
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/social/reviews"), "no separate history or match requests");
    assert.equal(url.searchParams.get("includeMatch"), "1");
    reads++;
    return Response.json({
      items: [
        {
          id: "review",
          contentType: "movie",
          contentId: target.itemKey,
          score: 8,
          updatedAt: "2026-11-19T00:00:00Z",
          author: { handle: "friend", displayName: "Friend" },
          match,
        },
      ],
    });
  });
  const [summary, everyone] = await Promise.all([
    loadTitleRatingSummary(target),
    loadTitleReviewsWithMatches(target, "everyone"),
  ]);
  assert.equal(summary.averageScore, 8);
  assert.deepEqual(everyone.ratings[0].match, match);
  assert.deepEqual((await loadTitleReviewsWithMatches(target, "friends")).ratings[0].match, match);
  assert.deepEqual(await getMutualMatch("preload-viewer", "friend"), match);
  assert.equal(reads, 2, "one request per scope reused across surfaces");
});

test("background preloads are bounded and discard queued offscreen or previous-account titles", async (t) => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { hidden: false } });
  applyAuthResult({
    token: "fixture-token",
    user: { id: "queue-viewer", handle: "viewer", username: "viewer" },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const titles = new Set<string>();
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/social/reviews"));
    titles.add(url.searchParams.get("contentId")!);
    await gate;
    return Response.json({ items: [] });
  });
  prefetchHoverRatings("movie", "queue-first");
  prefetchHoverRatings("movie", "queue-second");
  const cancel = prefetchHoverRatings("movie", "queue-offscreen");
  prefetchHoverRatings("movie", "queue-old-account");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(titles.size, 2);
  cancel();
  applyAuthResult({
    token: "other-token",
    user: { id: "other-viewer", handle: "other", username: "other" },
  });
  release();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual([...titles].sort(), ["queue-first", "queue-second"]);
  Reflect.deleteProperty(globalThis, "document");
});
