import assert from "node:assert/strict";
import test from "node:test";
import { filterQuickReviews } from "@/lib/social/quick-reviews";

/**
 * The With Review toggle must actually remove rows, not just look pressed. The fallback path
 * (used whenever the hub route is absent) had no filter at all, so these assertions hold the
 * behaviour for the path that runs against the currently deployed backend.
 */

type Row = Parameters<typeof filterQuickReviews>[0][number];

function row(id: string, review?: string): Row {
  return {
    id,
    contentType: "movie",
    contentId: id,
    score: 7,
    title: id,
    review,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    reactions: { count: 0, viewerReacted: false },
    comments: { count: 0 },
  } as Row;
}

const rows = [row("written", "A fine film."), row("blank"), row("spaces", "   "), row("empty", "")];

test("with review keeps only ratings that carry written text", () => {
  assert.deepEqual(
    filterQuickReviews(rows, { withReview: true }).map((r) => r.id),
    ["written"],
  );
});

test("with review off keeps every rating, including the ones without text", () => {
  assert.deepEqual(
    filterQuickReviews(rows, { withReview: false }).map((r) => r.id),
    ["written", "blank", "spaces", "empty"],
  );
});

test("the filter composes with search instead of replacing it", () => {
  assert.deepEqual(
    filterQuickReviews(rows, { withReview: true, q: "fine" }).map((r) => r.id),
    ["written"],
  );
  assert.deepEqual(filterQuickReviews(rows, { withReview: true, q: "blank" }), []);
});

test("the title behind the open review is still excluded when the filter is on", () => {
  assert.deepEqual(
    filterQuickReviews(rows, { withReview: true, excludeContentId: "written" }).map((r) => r.id),
    [],
  );
});

test("exclusion respects media type, so an equal key under another type survives", () => {
  const typed = [row("1396"), { ...row("1396"), contentType: "tv" } as Row];
  const kept = filterQuickReviews(typed, {
    withReview: false,
    excludeContentId: "1396",
    excludeContentType: "movie",
  });
  assert.deepEqual(
    kept.map((r) => r.contentType),
    ["tv"],
  );
});
