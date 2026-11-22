import assert from "node:assert/strict";
import test from "node:test";
import { invalidateTitleReviewCaches, loadTitleRatingSummary } from "@/lib/social/title-reviews";
import { clearUserDirectoryCache } from "@/lib/social/user-directory";

test("hover averages refresh newly posted ratings after their cache expires", async (t) => {
  let now = Date.now();
  let published = false;
  t.mock.method(Date, "now", () => now);
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const target = { mediaType: "movie", itemKey: "hover-average-test" } as const;
  invalidateTitleReviewCaches();
  clearUserDirectoryCache();
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/themes/api", "");
    requests.push(path);
    if (path === "/social/reviews") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (path === "/social/groups/discover") {
      return Response.json({
        groups: [{ id: "test-group", memberPreview: [{ handle: "alpha" }, { handle: "beta" }] }],
      });
    }
    if (path === "/social/groups/test-group") return Response.json({ members: [] });
    if (path.endsWith("/friends")) return Response.json([]);
    if (path === "/social/u/alpha/ratings" || path === "/social/u/beta/ratings") {
      return Response.json({
        items: [
          ...(published
            ? [{ ...target, itemKey: "newly-rated", score: 9, at: "2026-11-19T01:00:00.000Z" }]
            : []),
          {
            ...target,
            score: path.includes("/alpha/") ? 6 : 10,
            title: "Test title",
            at: path.includes("/alpha/") ? "2026-11-18T00:00:00.000Z" : "2026-11-19T00:00:00.000Z",
          },
          {
            itemKey: target.itemKey,
            mediaType: "anime",
            score: 1,
            at: "2026-11-19T00:00:00.000Z",
          },
        ],
      });
    }
    throw new Error(`Unexpected request ${path}`);
  };
  try {
    const [first, duplicate] = await Promise.all([
      loadTitleRatingSummary(target),
      loadTitleRatingSummary(target),
    ]);
    assert.equal(first.averageScore, 8);
    assert.equal(first.total, 2);
    assert.deepEqual(
      first.recentRatings.map((rating) => rating.handle),
      ["beta", "alpha"],
    );
    assert.deepEqual(duplicate, first);
    assert.deepEqual(await loadTitleRatingSummary(target), first);
    assert.equal(requests.filter((path) => path.endsWith("/ratings")).length, 2);
    assert.equal(
      requests.some((path) => path.includes("/mutual")),
      false,
    );
    const newTitle = { ...target, itemKey: "newly-rated" };
    assert.deepEqual(await loadTitleRatingSummary(newTitle), {
      averageScore: null,
      total: 0,
      recentRatings: [],
      friends: [],
    });
    published = true;
    now += 10_001;
    const updated = await loadTitleRatingSummary(newTitle);
    assert.equal(updated.averageScore, 9);
    assert.equal(updated.total, 2);
    assert.equal(updated.recentRatings.length, 2);
    assert.equal(requests.filter((path) => path.endsWith("/ratings")).length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    invalidateTitleReviewCaches();
    clearUserDirectoryCache();
  }
});
