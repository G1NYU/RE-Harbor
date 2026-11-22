import type { RatingMediaType, PublicRating } from "@/lib/ratings/types";
import { socialGet } from "./client";
import type { RatingSort, TitleRef } from "./review-rank";

export type QuickSort = RatingSort;

export type QuickReview = {
  /** Missing on older backends that do not expose review interactions. */
  id?: string;
  contentType: RatingMediaType;
  contentId: string;
  score: number;
  title?: string;
  posterUrl?: string;
  review?: string;
  spoiler?: boolean;
  createdAt: string;
  updatedAt: string;
  reactions: { count: number; viewerReacted: boolean };
  comments: { count: number };
};

export function fetchQuickReviews<T>(handle: string, query: string, cursor?: string): Promise<T> {
  const params = new URLSearchParams(query);
  if (cursor) params.set("cursor", cursor);
  return socialGet<T>(`/social/u/${encodeURIComponent(handle)}/quick?${params}`);
}

export async function findAuthorReviewId(
  handle: string,
  target: TitleRef,
): Promise<string | undefined> {
  const exact = new URLSearchParams({
    contentType: target.mediaType,
    contentId: target.itemKey,
    limit: "1",
  });
  const sameTitle = (review: QuickReview) =>
    review.contentId === target.itemKey && review.contentType === target.mediaType;
  try {
    const { items, total } = await socialGet<{ items: QuickReview[]; total: number }>(
      `/social/u/${encodeURIComponent(handle)}/reviews?${exact}`,
    );
    const match = items.find(sameTitle);
    if (match?.id || total === 0) return match?.id;
  } catch (error) {
    const response = error as { status?: number; body?: { error?: string } };
    if (response.status !== 405 && (response.status !== 404 || response.body?.error)) throw error;
  }

  // Older servers can search Quick Access by title ID, then we verify the exact title pair.
  const query = new URLSearchParams({ q: target.itemKey, limit: "50" }).toString();
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const { reviews } = await fetchQuickReviews<{
      reviews: { items: QuickReview[]; nextCursor?: string };
    }>(handle, query, cursor);
    const match = reviews.items.find(sameTitle);
    if (match?.id) return match.id;
    cursor = reviews.nextCursor;
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);
  } while (cursor);
  return undefined;
}

export function reviewFromRating(rating: PublicRating): QuickReview {
  return {
    id: rating.reviewId ?? rating.id,
    contentType: rating.mediaType,
    contentId: rating.itemKey,
    score: rating.score,
    title: rating.title,
    posterUrl: rating.posterUrl,
    review: rating.review,
    spoiler: rating.spoiler,
    createdAt: rating.at,
    updatedAt: rating.at,
    reactions: {
      count: rating.reactions?.count ?? 0,
      viewerReacted: rating.reactions?.mine ?? false,
    },
    comments: { count: rating.comments?.count ?? 0 },
  };
}

/** Order a loaded page without mutating it. Server paths use the matching cursor sort. */
export function sortQuickReviews(items: QuickReview[], sort: QuickSort): QuickReview[] {
  const list = items.slice();
  const recent = (a: QuickReview, b: QuickReview) =>
    Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
  if (sort === "highest" || sort === "lowest") {
    const dir = sort === "highest" ? -1 : 1;
    return list.sort((a, b) => (a.score === b.score ? recent(a, b) : dir * (a.score - b.score)));
  }
  if (sort === "liked" || sort === "commented") {
    const count = (row: QuickReview) =>
      Math.max(0, (sort === "liked" ? row.reactions?.count : row.comments?.count) ?? 0);
    return list.sort((a, b) => (count(a) === count(b) ? recent(a, b) : count(b) - count(a)));
  }
  return list.sort(recent);
}

/** Search, review-only filtering, and title exclusion shared by server and fallback paths. */
export function filterQuickReviews(
  items: QuickReview[],
  opts: {
    q?: string;
    withReview?: boolean;
    excludeContentId?: string;
    excludeContentType?: string;
  },
): QuickReview[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  return items.filter((review) => {
    const sameTitle =
      !!opts.excludeContentId &&
      review.contentId === opts.excludeContentId &&
      (!opts.excludeContentType || review.contentType === opts.excludeContentType);
    if (sameTitle) return false;
    if (opts.withReview && !(review.review ?? "").trim()) return false;
    if (!q) return true;
    return `${review.title || ""} ${review.review || ""} ${review.contentId}`
      .toLowerCase()
      .includes(q);
  });
}

/** Apply the fallback path's filter, sort, and page in the same order as the hub route. */
export function pageQuickReviews(
  items: QuickReview[],
  options: {
    q?: string;
    withReview?: boolean;
    excludeContentId?: string;
    excludeContentType?: string;
    sort: QuickSort;
    offset: number;
    limit: number;
  },
): { items: QuickReview[]; nextOffset?: number; total: number } {
  const filtered = filterQuickReviews(items, options);
  const sorted = sortQuickReviews(filtered, options.sort);
  const start = Math.max(0, options.offset);
  const end = start + Math.max(0, options.limit);
  return {
    items: sorted.slice(start, end),
    nextOffset: end < sorted.length ? end : undefined,
    total: sorted.length,
  };
}
