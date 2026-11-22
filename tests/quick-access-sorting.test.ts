import assert from "node:assert/strict";
import test from "node:test";
import { pageQuickReviews, sortQuickReviews } from "@/lib/social/quick-reviews";

/**
 * Quick Access has two data paths. The hub route sorts on the server; the degraded path
 * (no hub route) sorts locally with this function. Both must agree on the visible order,
 * and the degraded path must not invent engagement ordering it has no counts for.
 */

type Row = Parameters<typeof sortQuickReviews>[0][number];

function row(id: string, score: number, at: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    contentType: "movie",
    contentId: id,
    score,
    title: id,
    createdAt: at,
    updatedAt: at,
    reactions: { count: 0, viewerReacted: false },
    comments: { count: 0 },
    ...extra,
  } as Row;
}

const rows = [
  row("old-high", 10, "2026-01-01T00:00:00Z"),
  row("new-low", 3, "2026-03-01T00:00:00Z"),
  row("mid", 6, "2026-02-01T00:00:00Z"),
];

test("default order is most recent first", () => {
  assert.deepEqual(
    sortQuickReviews(rows, "recent").map((r) => r.id),
    ["new-low", "mid", "old-high"],
  );
});

test("highest and lowest rated order by score and fall back to recency on a tie", () => {
  const tied = [...rows, row("old-low", 3, "2025-12-01T00:00:00Z")];
  assert.deepEqual(
    sortQuickReviews(tied, "highest").map((r) => r.id),
    ["old-high", "mid", "new-low", "old-low"],
  );
  assert.deepEqual(
    sortQuickReviews(tied, "lowest").map((r) => r.id),
    ["new-low", "old-low", "mid", "old-high"],
  );
});

test("most liked and most commented rank by the real counters", () => {
  const engagement = [
    row("quiet", 8, "2026-03-01T00:00:00Z"),
    row("liked", 2, "2026-01-01T00:00:00Z", {
      reactions: { count: 9, viewerReacted: false },
      comments: { count: 1 },
    }),
    row("talked", 4, "2026-02-01T00:00:00Z", {
      reactions: { count: 2, viewerReacted: false },
      comments: { count: 7 },
    }),
  ] as Row[];
  assert.deepEqual(
    sortQuickReviews(engagement, "liked").map((r) => r.id),
    ["liked", "talked", "quiet"],
  );
  assert.deepEqual(
    sortQuickReviews(engagement, "commented").map((r) => r.id),
    ["talked", "liked", "quiet"],
  );
});

test("equal counters fall back to recency, and missing counts sort last", () => {
  const tied = [
    row("older", 5, "2026-01-01T00:00:00Z", { reactions: { count: 3, viewerReacted: false } }),
    row("newer", 5, "2026-03-01T00:00:00Z", { reactions: { count: 3, viewerReacted: false } }),
    row("none", 5, "2026-02-01T00:00:00Z", { reactions: undefined as never }),
  ] as Row[];
  assert.deepEqual(
    sortQuickReviews(tied, "liked").map((r) => r.id),
    ["newer", "older", "none"],
  );
});

test("sorting does not mutate the loaded page", () => {
  const before = rows.map((r) => r.id);
  sortQuickReviews(rows, "highest");
  assert.deepEqual(
    rows.map((r) => r.id),
    before,
  );
});

test("fallback paging composes review filter, search, title exclusion, and popularity order", () => {
  const combined = [
    row("one", 5, "2026-01-01T00:00:00Z", {
      review: "shared opinion",
      reactions: { count: 3, viewerReacted: false },
    }),
    row("two", 6, "2026-02-01T00:00:00Z", {
      review: "shared opinion",
      reactions: { count: 8, viewerReacted: false },
    }),
    row("three", 7, "2026-03-01T00:00:00Z", {
      review: "shared opinion",
      reactions: { count: 8, viewerReacted: false },
    }),
    row("blank", 9, "2026-04-01T00:00:00Z", {
      reactions: { count: 99, viewerReacted: false },
    }),
    row("excluded", 8, "2026-05-01T00:00:00Z", {
      review: "shared opinion",
      reactions: { count: 50, viewerReacted: false },
    }),
  ];
  const options = {
    q: "shared",
    withReview: true,
    excludeContentId: "excluded",
    sort: "liked" as const,
    limit: 2,
  };
  const first = pageQuickReviews(combined, { ...options, offset: 0 });
  assert.deepEqual(
    first.items.map((item) => item.id),
    ["three", "two"],
  );
  assert.equal(first.nextOffset, 2);
  assert.equal(first.total, 3);

  const second = pageQuickReviews(combined, { ...options, offset: first.nextOffset! });
  assert.deepEqual(
    second.items.map((item) => item.id),
    ["one"],
  );
  assert.equal(second.nextOffset, undefined);
  assert.equal(second.total, 3);
});
