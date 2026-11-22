import { useSyncExternalStore } from "react";
import { captureSessionScope, currentAuthor } from "@/lib/theme-auth";
import type { RatingMediaType } from "@/lib/ratings/types";
import type { TitleRating } from "./review-rank";
import { loadTitleRatingSummary } from "./title-reviews";

export type FriendReviewMark = {
  handle: string;
  alias: string;
  avatarUrl?: string;
  at: number;
  totalCount?: number;
};

export type HoverRatingSummary = {
  averageScore: number | null;
  community: FriendReviewMark[];
  friends: FriendReviewMark[];
  total: number;
};

const summaries = new Map<string, HoverRatingSummary>();
const inflight = new Map<string, Promise<HoverRatingSummary | undefined>>();
const listeners = new Set<() => void>();

/** A title's identity includes its media type. */
export function markKeyForItem(mediaType: string, itemKey: string): string {
  return `${mediaType.trim()}|${itemKey.trim()}`;
}

function summaryKey(mediaType: string, itemKey: string): string {
  return `${currentAuthor()?.id ?? "anon"}|${markKeyForItem(mediaType, itemKey)}`;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useTitleHoverSummary(
  mediaType: string,
  itemKey: string,
): HoverRatingSummary | undefined {
  const key = summaryKey(mediaType, itemKey);
  return useSyncExternalStore(
    subscribe,
    () => summaries.get(key),
    () => undefined,
  );
}

function marksFromRatings(ratings: TitleRating[], total: number): FriendReviewMark[] {
  return ratings.map((rating) => ({
    handle: rating.handle,
    alias: rating.alias,
    avatarUrl: rating.avatarUrl,
    at: Date.parse(rating.at) || 0,
    totalCount: total,
  }));
}

/** Shares Social Reviews' paginated review reads and its cached legacy fallback. */
export function ensureMarksForTitle(
  contentType: string,
  contentId: string,
): Promise<HoverRatingSummary | undefined> {
  if (!contentType || !contentId) return Promise.resolve(undefined);
  const key = summaryKey(contentType, contentId);
  const pending = inflight.get(key);
  if (pending) return pending;
  const isCurrent = captureSessionScope();
  const task = loadTitleRatingSummary({
    mediaType: contentType as RatingMediaType,
    itemKey: contentId,
  })
    .then((summary) => {
      if (!isCurrent()) return undefined;
      const next: HoverRatingSummary = {
        averageScore: summary.averageScore,
        total: summary.total,
        friends: marksFromRatings(summary.friends, summary.friends.length),
        community: marksFromRatings(summary.recentRatings, summary.total),
      };
      summaries.set(key, next);
      for (const listener of listeners) listener();
      return next;
    })
    .catch(() => undefined)
    .finally(() => {
      if (inflight.get(key) === task) inflight.delete(key);
    });
  inflight.set(key, task);
  return task;
}
