import type { MyRating, RatingMediaType } from "@/lib/ratings/types";
import { captureSessionScope, currentAuthor } from "@/lib/theme-auth";
import { socialGet } from "./client";
import { fetchMyRatings, fetchUserRatings } from "./ratings-api";
import type { MutualMatch } from "./mutual-score";

export type MutualSort = "recent" | "highest" | "difference";

export type MutualRow = {
  itemKey: string;
  mediaType: RatingMediaType;
  title: string;
  posterUrl?: string;
  myScore: number;
  theirScore: number;
  diff: number;
  myReview: string | null;
  theirReview: string | null;
  mySpoiler?: boolean;
  theirSpoiler?: boolean;
  myAt: number;
  theirAt: number;
};

export type MutualPage = {
  score: number | null;
  count: number;
  page: MutualRow[];
  nextCursor?: string;
  total: number;
};

const PAGE_SIZE = 20;

class MissingMutualSpoilerFlags extends Error {}

export async function fetchMutualPage(
  handle: string,
  sort: MutualSort,
  signal: AbortSignal,
  cursor?: string,
  withReview = false,
): Promise<MutualPage> {
  const query = new URLSearchParams({ sort });
  if (cursor) query.set("cursor", cursor);
  if (withReview) query.set("withReview", "1");
  const page = await socialGet<MutualPage>(
    `/social/u/${encodeURIComponent(handle)}/mutual?${query}`,
    signal,
  );
  if (
    page.page.some(
      (row) => typeof row.mySpoiler !== "boolean" || typeof row.theirSpoiler !== "boolean",
    )
  ) {
    throw new MissingMutualSpoilerFlags();
  }
  return page;
}

export function shouldUseMutualHistory(error: unknown): boolean {
  if (error instanceof MissingMutualSpoilerFlags) return true;
  const response = error as { status?: number; body?: { error?: string } } | null;
  // The route's own 404 is a visibility decision, so only fall back if the route is absent.
  return response?.status === 405 || (response?.status === 404 && !response.body?.error);
}

function ratingKey(rating: { mediaType: RatingMediaType; itemKey: string }): string {
  return `${rating.mediaType}:${rating.itemKey}`;
}

export async function loadMutualHistory(handle: string, signal: AbortSignal): Promise<MutualRow[]> {
  const isCurrent = captureSessionScope();
  const profile = await socialGet<{ private?: boolean; isOwner?: boolean; friendStatus?: string }>(
    `/social/u/${encodeURIComponent(handle)}`,
    signal,
  );
  if (profile.private || profile.isOwner || profile.friendStatus === "blocked") return [];
  const mine = new Map((await getViewerRatings()).map((rating) => [ratingKey(rating), rating]));
  signal.throwIfAborted();
  if (!isCurrent()) throw new Error("Account changed");
  const shared = new Map<string, MutualRow>();
  const seen = new Set<string>();
  let cursor: string | undefined;

  while (mine.size > shared.size) {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error("Account changed");
    const { items, nextCursor } = await fetchUserRatings(handle, { cursor }, signal);
    for (const theirs of items) {
      const key = ratingKey(theirs);
      const myRating = mine.get(key);
      if (!myRating || shared.has(key)) continue;
      shared.set(key, {
        itemKey: theirs.itemKey,
        mediaType: theirs.mediaType,
        title: theirs.title || myRating.title,
        posterUrl: theirs.posterUrl || myRating.poster,
        myScore: myRating.score,
        theirScore: theirs.score,
        diff: Math.abs(myRating.score - theirs.score),
        myReview: myRating.review?.trim() || null,
        theirReview: theirs.review?.trim() || null,
        mySpoiler: myRating.spoiler,
        theirSpoiler: theirs.spoiler,
        myAt: myRating.updatedAt,
        theirAt: Date.parse(theirs.at) || 0,
      });
    }
    if (!nextCursor) break;
    if (seen.has(nextCursor)) throw new Error("Repeated ratings cursor");
    seen.add(nextCursor);
    cursor = nextCursor;
  }
  return [...shared.values()];
}

export function pageMutualHistory(
  rows: MutualRow[],
  sort: MutualSort,
  limit: number,
  withReview = false,
): MutualPage {
  const visible = withReview ? rows.filter((row) => row.myReview || row.theirReview) : [...rows];
  visible.sort((a, b) => {
    if (sort === "highest") {
      const lowest = Math.min(b.myScore, b.theirScore) - Math.min(a.myScore, a.theirScore);
      if (lowest) return lowest;
      const combined = b.myScore + b.theirScore - a.myScore - a.theirScore;
      if (combined) return combined;
    }
    if (sort === "difference" && a.diff !== b.diff) return b.diff - a.diff;
    return (
      Math.max(b.myAt, b.theirAt) - Math.max(a.myAt, a.theirAt) ||
      ratingKey(a).localeCompare(ratingKey(b))
    );
  });
  return {
    ...summarizeMutualHistory(rows),
    total: visible.length,
    page: visible.slice(0, limit),
  };
}

export const INITIAL_MUTUAL_ROWS = PAGE_SIZE;

function summarizeMutualHistory(rows: MutualRow[]): MutualMatch {
  const count = rows.length;
  if (!count) return { score: null, count };
  const meanDifference = rows.reduce((sum, row) => sum + row.diff, 0) / count;
  return { score: Math.round(100 * (1 - meanDifference / 9)), count };
}

const CACHE_MS = 2 * 60_000;
let viewerRatings: { viewer: string; at: number; result: Promise<MyRating[]> } | undefined;
const matches = new Map<string, { at: number; result: Promise<MutualMatch> }>();
let activeMatches = 0;
const waiters: Array<() => void> = [];
let missingRouteUntil = 0;

/** Reuse comparisons already bundled with the title's review response. */
export function rememberMutualMatch(viewer: string, handle: string, match: MutualMatch): void {
  matches.set(JSON.stringify([viewer, handle.toLowerCase()]), {
    at: Date.now(),
    result: Promise.resolve(match),
  });
}

function getViewerRatings(): Promise<MyRating[]> {
  const viewer = currentAuthor()?.id;
  if (!viewer) return Promise.reject(new Error("Sign in required"));
  if (viewerRatings?.viewer === viewer && Date.now() - viewerRatings.at < CACHE_MS) {
    return viewerRatings.result;
  }
  const result = fetchMyRatings().catch((error: unknown) => {
    if (viewerRatings?.result === result) viewerRatings = undefined;
    throw error;
  });
  viewerRatings = { viewer, at: Date.now(), result };
  return result;
}

export function getMutualMatch(viewer: string, handle: string): Promise<MutualMatch> {
  const key = JSON.stringify([viewer, handle.toLowerCase()]);
  const cached = matches.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  const isCurrent = captureSessionScope();
  const result = (async () => {
    // Only a few review authors can be running a comparison at once.
    if (activeMatches >= 3) await new Promise<void>((resolve) => waiters.push(resolve));
    else activeMatches++;
    try {
      if (!isCurrent() || currentAuthor()?.id !== viewer) throw new Error("Account changed");
      const signal = new AbortController().signal;
      if (Date.now() >= missingRouteUntil) {
        try {
          const { score, count } = await fetchMutualPage(handle, "recent", signal);
          return { score, count };
        } catch (error) {
          if (!shouldUseMutualHistory(error)) throw error;
          missingRouteUntil = Date.now() + CACHE_MS;
        }
      }
      return summarizeMutualHistory(await loadMutualHistory(handle, signal));
    } finally {
      const next = waiters.shift();
      if (next) next();
      else activeMatches--;
    }
  })().catch((error: unknown) => {
    if (matches.get(key)?.result === result) matches.delete(key);
    throw error;
  });
  for (const [cachedKey, entry] of matches) {
    if (Date.now() - entry.at >= CACHE_MS) matches.delete(cachedKey);
  }
  matches.set(key, { at: Date.now(), result });
  return result;
}
