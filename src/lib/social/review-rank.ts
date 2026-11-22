import { parseQuotedBody } from "@/lib/ratings/quote";
import type { PublicRating, RatingMediaType } from "@/lib/ratings/types";
import type { MutualMatch } from "./mutual-score";
import { tmdbImdbCached, tmdbFromImdbCached } from "@/lib/providers/tmdb/tmdb-imdb-resolve";

/** The exact title a review belongs to: an item key is only unique inside its media type. */
export type TitleRef = { itemKey: string; mediaType: RatingMediaType };

/** One person's rating of one title. `review` is absent when they only left a score. */
export type TitleRating = {
  handle: string;
  alias: string;
  avatarUrl?: string;
  verified?: boolean;
  itemKey: string;
  mediaType: RatingMediaType;
  score: number;
  review?: string;
  spoiler?: boolean;
  at: string;
  /** Review-hub identity and counters; absent on a backend without the review hub. */
  reviewId?: string;
  reactions?: { count: number; mine: boolean };
  comments?: { count: number };
  match?: MutualMatch;
};

export type RatingSort = "recent" | "liked" | "commented" | "highest" | "lowest";

export function foldHandle(handle: string | null | undefined): string {
  return (handle ?? "").trim().toLowerCase();
}

export function sameTitle(a: TitleRef, b: TitleRef): boolean {
  if (a.mediaType !== b.mediaType) return false;
  if (a.itemKey === b.itemKey) return true;
  const aImdb = tmdbImdbCached(a.itemKey);
  const bImdb = tmdbImdbCached(b.itemKey);
  return (
    !!(aImdb && bImdb && aImdb === bImdb) ||
    tmdbFromImdbCached(a.itemKey) === b.itemKey ||
    tmdbFromImdbCached(b.itemKey) === a.itemKey
  );
}

function timeOf(at: string): number {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Turns one published rating into a review row. A rating without review text still counts as a
 * rating of the title, so the row survives with `review` unset.
 */
export function titleRatingFrom(
  rating: PublicRating,
  author: { handle: string; alias?: string; avatarUrl?: string; verified?: boolean },
): TitleRating | null {
  const handle = author.handle.trim();
  if (!handle || !rating.itemKey || !Number.isFinite(rating.score)) return null;
  const review = typeof rating.review === "string" ? rating.review.trim() : "";
  return {
    handle,
    alias: (author.alias ?? "").trim() || handle,
    avatarUrl: author.avatarUrl || undefined,
    verified: author.verified || undefined,
    itemKey: rating.itemKey,
    mediaType: rating.mediaType,
    score: rating.score,
    review: review || undefined,
    spoiler: rating.spoiler || undefined,
    at: rating.at,
    reviewId: rating.reviewId ?? rating.id,
    reactions: rating.reactions ? { ...rating.reactions } : undefined,
    comments: rating.comments ? { ...rating.comments } : undefined,
  };
}

/** The newest rating a person left for exactly this title, if their history holds one. */
export function pickTitleRating(
  items: readonly PublicRating[],
  target: TitleRef,
): PublicRating | null {
  let newest: PublicRating | null = null;
  for (const item of items) {
    if (!sameTitle(item, target) || !Number.isFinite(item.score)) continue;
    if (!newest || timeOf(item.at) > timeOf(newest.at)) newest = item;
  }
  return newest;
}

export function hasReview(rating: TitleRating): boolean {
  return !!rating.review;
}

/**
 * One row per person, newest first. Ratings for another media type or item key are dropped, and
 * the viewer is never listed against their own title.
 */
export function mergeTitleRatings(
  ratings: readonly TitleRating[],
  target: TitleRef,
  selfHandle?: string | null,
): TitleRating[] {
  const self = foldHandle(selfHandle);
  const byHandle = new Map<string, TitleRating>();
  for (const rating of ratings) {
    const key = foldHandle(rating.handle);
    if (!key || key === self || !sameTitle(rating, target)) continue;
    const existing = byHandle.get(key);
    if (!existing || timeOf(rating.at) > timeOf(existing.at)) byHandle.set(key, rating);
  }
  return [...byHandle.values()].sort((a, b) => timeOf(b.at) - timeOf(a.at));
}

export function sortTitleRatings(ratings: readonly TitleRating[], sort: RatingSort): TitleRating[] {
  const list = [...ratings];
  if (sort === "liked" || sort === "commented") {
    const count = (rating: TitleRating) =>
      sort === "liked" ? (rating.reactions?.count ?? 0) : (rating.comments?.count ?? 0);
    list.sort((a, b) => count(b) - count(a) || timeOf(b.at) - timeOf(a.at));
  } else if (sort === "highest")
    list.sort((a, b) => b.score - a.score || timeOf(b.at) - timeOf(a.at));
  else if (sort === "lowest") list.sort((a, b) => a.score - b.score || timeOf(b.at) - timeOf(a.at));
  else list.sort((a, b) => timeOf(b.at) - timeOf(a.at));
  return list;
}

/** Distinct handles for the overlapping avatar stack, in the order their ratings arrived. */
export function stackHandles(ratings: readonly TitleRating[], max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rating of ratings) {
    const key = foldHandle(rating.handle);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(rating.handle);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * A review's discussion lives on the reviewer's profile, and each reply carries the rated title
 * as a quote marker. This is how a profile comment can be matched back to the review it answers.
 */
export function commentQuotesTitle(body: string, target: TitleRef): boolean {
  const { quote } = parseQuotedBody(body);
  return !!quote && quote.itemKey === target.itemKey && quote.mediaType === target.mediaType;
}
