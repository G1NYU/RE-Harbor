import "./_localstorage-stub";
import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthResult, reloadSession } from "@/lib/theme-auth";
import { ensureMarksForTitle } from "@/lib/social/friend-review-index";
import {
  invalidateTitleReviewCaches,
  loadTitleReviewsWithMatches,
} from "@/lib/social/title-reviews";
import { clearUserDirectoryCache } from "@/lib/social/user-directory";

const target = { mediaType: "movie", itemKey: "fixture-title" } as const;
function review(index: number, score: number) {
  return {
    id: `review-${index}`,
    contentType: target.mediaType,
    contentId: target.itemKey,
    score,
    createdAt: `2026-11-19T00:00:0${7 - index}Z`,
    updatedAt: `2026-11-19T00:00:0${7 - index}Z`,
    author: {
      handle: `reviewer-${index}`,
      displayName: `Reviewer ${index}`,
      avatarUrl: `https://fixture.invalid/${index}.png`,
    },
    match: { score: null, count: 0 },
  };
}

test("hover uses the paginated Social Reviews API for averages and reviewers without a summary endpoint", async (t) => {
  let now = Date.now();
  let fail = false;
  const rows = [10, 8, 6, 9, 7, 5, 4].map((score, index) => review(index, score));
  let friends = [rows[1], rows[4]];
  const requests: string[] = [];
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/themes/api", "");
    requests.push(path);
    assert.equal(init?.method ?? "GET", "GET");
    assert.equal(path, "/social/reviews");
    if (fail) return Response.json({ error: "unavailable" }, { status: 500 });
    const list = url.searchParams.get("scope") === "friends" ? friends : rows;
    const offset = Number(url.searchParams.get("cursor") ?? 0);
    return Response.json({
      items: list.slice(offset, offset + 2),
      total: list.length,
      nextCursor: offset + 2 < list.length ? String(offset + 2) : undefined,
    });
  });
  invalidateTitleReviewCaches();
  applyAuthResult({
    token: "fixture-session",
    user: { id: "viewer", handle: "viewer", username: "viewer" },
  });
  try {
    const [first, concurrent] = await Promise.all([
      ensureMarksForTitle(target.mediaType, target.itemKey),
      ensureMarksForTitle(target.mediaType, target.itemKey),
    ]);
    assert.ok(first);
    assert.equal(first, concurrent);
    assert.equal(first.averageScore, 7);
    assert.equal(first.total, 7);
    assert.deepEqual(
      first.friends.map((mark) => mark.handle),
      ["reviewer-1", "reviewer-4"],
    );
    assert.deepEqual(
      first.community.map((mark) => mark.handle),
      ["reviewer-0", "reviewer-1", "reviewer-2"],
    );
    assert.equal(first.community[0].totalCount, 7);
    assert.equal(requests.length, 5);
    await ensureMarksForTitle(target.mediaType, target.itemKey);
    assert.equal(requests.length, 5);
    const panel = await loadTitleReviewsWithMatches(target, "everyone");
    assert.equal(
      first.averageScore,
      panel.ratings.reduce((sum, row) => sum + row.score, 0) / panel.ratings.length,
    );
    now += 10_001;
    rows[6].score = 8;
    friends = [];
    const updated = await ensureMarksForTitle(target.mediaType, target.itemKey);
    assert.equal(updated?.averageScore, 7.6);
    assert.deepEqual(updated?.friends, []);
    assert.equal(updated?.community.length, 3);
    now += 10_001;
    fail = true;
    assert.equal(await ensureMarksForTitle(target.mediaType, target.itemKey), undefined);
    fail = false;
    assert.equal((await ensureMarksForTitle(target.mediaType, target.itemKey))?.averageScore, 7.6);
  } finally {
    localStorage.removeItem("harbor.theme-session");
    reloadSession(true);
    invalidateTitleReviewCaches();
  }
});

test("an open app discovers the review API after an older backend is deployed", async (t) => {
  let now = Date.now();
  let deployed = false;
  let reviewReads = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/themes/api", "");
    if (path === "/social/reviews") {
      reviewReads++;
      return deployed
        ? Response.json({ items: [review(0, 9)], total: 1 })
        : Response.json({ error: "not_found" }, { status: 404 });
    }
    if (path === "/social/groups/discover") return Response.json({ groups: [] });
    throw new Error(`Unexpected request ${path}`);
  });
  invalidateTitleReviewCaches();
  clearUserDirectoryCache();
  try {
    assert.equal((await ensureMarksForTitle(target.mediaType, target.itemKey))?.total, 0);
    deployed = true;
    now += 30_001;
    const live = await ensureMarksForTitle(target.mediaType, target.itemKey);
    assert.equal(live?.averageScore, 9);
    assert.equal(live?.community[0].handle, "reviewer-0");
    assert.equal(reviewReads, 2);
  } finally {
    invalidateTitleReviewCaches();
    clearUserDirectoryCache();
  }
});
