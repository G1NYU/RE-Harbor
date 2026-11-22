import type { PublicRating, RatingMediaType } from "@/lib/ratings/types";
import { captureSessionScope, currentAuthor } from "@/lib/theme-auth";
import { fetchFriends, type Friend } from "./friends";
import { fetchUserRatings } from "./ratings-api";
import { socialGet } from "./client";
import {
  foldHandle,
  mergeTitleRatings,
  pickTitleRating,
  titleRatingFrom,
  type TitleRating,
  type TitleRef,
} from "./review-rank";
import { loadUserDirectory } from "./user-directory";
import { getMutualMatch, rememberMutualMatch } from "./mutual-ratings";
import type { MutualMatch } from "./mutual-score";
import {
  tmdbImdbId,
  tmdbIdFromImdb,
  tmdbFromImdbCached,
  tmdbImdbCached,
} from "@/lib/providers/tmdb/tmdb-imdb-resolve";
import { loadStoredSettings } from "@/lib/settings/load";
import { meta as cinemetaMeta } from "@/lib/cinemeta";

/**
 * Harbor now publishes a review hub at GET /social/reviews, which filters by title on the
 * server. It is the primary read path: one paginated request instead of one history scan per
 * person. Older deployments answer 404, so the history scan below remains the fallback and
 * the panel is never worse than it was before the route existed.
 */
const HUB_PAGE = 50;

type HubReview = {
  id: string;
  contentType: string;
  contentId: string;
  score: number;
  title?: string;
  posterUrl?: string;
  review?: string;
  spoiler?: boolean;
  createdAt: string;
  updatedAt: string;
  author: { handle: string; displayName?: string; avatarUrl?: string; verified?: boolean } | null;
  reactions?: { count: number; viewerReacted?: boolean };
  comments?: { count: number };
  match?: MutualMatch;
};

let hubRetryAt = 0;

function ratingFromHub(item: HubReview): TitleRating | null {
  const author = item.author;
  if (!author?.handle || !Number.isFinite(item.score)) return null;
  return {
    handle: author.handle,
    alias: author.displayName || author.handle,
    avatarUrl: author.avatarUrl || undefined,
    verified: author.verified || undefined,
    itemKey: item.contentId,
    mediaType: item.contentType as RatingMediaType,
    score: item.score,
    review: item.review?.trim() || undefined,
    spoiler: item.spoiler || undefined,
    at: item.updatedAt || item.createdAt,
    reviewId: item.id,
    reactions: item.reactions
      ? { count: item.reactions.count || 0, mine: item.reactions.viewerReacted === true }
      : undefined,
    comments: item.comments ? { count: item.comments.count || 0 } : undefined,
    match: item.match,
  };
}

async function resolveTitleIdentity(target: TitleRef): Promise<void> {
  if (target.mediaType !== "movie" && target.mediaType !== "series") return;
  try {
    const key = loadStoredSettings().tmdbKey;
    if (key && target.itemKey.startsWith("tmdb:")) {
      await tmdbImdbId(key, target.itemKey);
    } else if (key && /^tt\d+$/.test(target.itemKey)) {
      await tmdbIdFromImdb(key, target.itemKey, target.mediaType);
    }
  } catch {
    // Optional ID resolution must not prevent reading the ratings themselves.
  }
  if (/^tt\d+$/.test(target.itemKey) && !tmdbFromImdbCached(target.itemKey)) {
    await cinemetaMeta(target.mediaType, target.itemKey).catch(() => null);
  }
}

/** Reads every review page across verified catalog aliases of the same title. */
async function loadHubTitleRatings(
  target: TitleRef,
  scope: "friends" | "all",
  selfHandle: string | undefined,
  signedOut: boolean,
  includeMatch: boolean,
): Promise<TitleRatingsSnapshot | null> {
  const key = JSON.stringify([
    currentAuthor()?.id,
    target.mediaType,
    target.itemKey,
    scope,
    includeMatch,
  ]);
  const hit = hubCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.promise;
  const promise = readHubTitleRatings(target, scope, selfHandle, signedOut, includeMatch).catch(
    (error) => {
      if (hubCache.get(key)?.promise === promise) hubCache.delete(key);
      throw error;
    },
  );
  hubCache.set(key, { at: Date.now(), promise });
  return promise;
}

async function readHubTitleRatings(
  target: TitleRef,
  scope: "friends" | "all",
  selfHandle: string | undefined,
  signedOut: boolean,
  includeMatch: boolean,
): Promise<TitleRatingsSnapshot | null> {
  if (Date.now() < hubRetryAt) return null;
  const isCurrent = captureSessionScope();
  const viewer = currentAuthor()?.id;
  await resolveTitleIdentity(target);
  const ratings: TitleRating[] = [];
  const contentIds = new Set([target.itemKey]);
  const imdb = tmdbImdbCached(target.itemKey);
  const tmdb = tmdbFromImdbCached(target.itemKey);
  if (imdb) contentIds.add(imdb);
  if (tmdb) contentIds.add(tmdb);
  for (const contentId of contentIds) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (;;) {
      const query = new URLSearchParams({
        contentType: target.mediaType,
        contentId,
        scope,
        sort: "newest",
        limit: String(HUB_PAGE),
      });
      if (includeMatch && !signedOut) query.set("includeMatch", "1");
      if (cursor) query.set("cursor", cursor);
      let data: { items?: HubReview[]; nextCursor?: string };
      try {
        data = await socialGet<{ items?: HubReview[]; nextCursor?: string }>(
          `/social/reviews?${query.toString()}`,
        );
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 404 || status === 405) {
          hubRetryAt = Date.now() + 30_000;
          return null;
        }
        throw error;
      }
      for (const item of data.items ?? []) {
        const rating = ratingFromHub(item);
        if (rating) {
          ratings.push(rating);
          if (viewer && isCurrent() && rating.match !== undefined)
            rememberMutualMatch(viewer, rating.handle, rating.match);
        }
      }
      if (!data.nextCursor) break;
      if (seen.has(data.nextCursor)) throw new Error("Repeated title reviews cursor");
      seen.add(data.nextCursor);
      cursor = data.nextCursor;
    }
  }
  return {
    ratings: mergeTitleRatings(ratings, target, selfHandle),
    complete: true,
    scanned: ratings.length,
    signedOut,
    source: "hub",
  };
}

/**
 * Harbor's older social API has no per-title review route: GET /social/ratings,
 * /social/ratings/{itemKey} and /social/u/{handle}/ratings/{itemKey} answer 404. On those
 * deployments reviews are only readable through a person's public rating history
 * (GET /social/u/{handle}/ratings), so a title's reviews are assembled from the people this
 * client can enumerate: your friends, and for Everyone the public community graph the app
 * can already see.
 */
/** People whose history is scanned for one title. Ratings are cached, so this is not per render. */
const COMMUNITY_CAP = 40;
/** Recent pages of a person's history (20 ratings each) before we stop looking for a title. */
const PAGE_CAP = 3;
const CONCURRENCY = 4;
const CACHE_TTL = 10_000;
const hubCache = new Map<string, { at: number; promise: Promise<TitleRatingsSnapshot | null> }>();

type AuthorMeta = {
  handle: string;
  alias?: string;
  avatarUrl?: string;
  verified?: boolean;
};

type AuthorHistory = { items: PublicRating[]; complete: boolean };

const historyCache = new Map<string, { at: number; history: AuthorHistory }>();
const historyInflight = new Map<string, Promise<AuthorHistory>>();

function historyKey(handle: string, mediaType: RatingMediaType): string {
  return `${mediaType}|${foldHandle(handle)}`;
}

function toAuthorMeta(
  friend: Friend | { handle: string; alias?: string; avatarUrl?: string; verified?: boolean },
): AuthorMeta {
  return {
    handle: friend.handle,
    alias: "alias" in friend ? friend.alias : undefined,
    avatarUrl: "avatarUrl" in friend ? friend.avatarUrl : undefined,
    verified: "verified" in friend ? friend.verified : undefined,
  };
}

/**
 * The newest pages of one person's history for one media type. Requesting the type from the
 * server keeps a film from ever being confused with an anime that shares an id, and keeps the
 * scan small.
 */
async function scanHistory(handle: string, mediaType: RatingMediaType): Promise<AuthorHistory> {
  const key = historyKey(handle, mediaType);
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.history;
  const running = historyInflight.get(key);
  if (running) return running;

  const task = (async (): Promise<AuthorHistory> => {
    const items: PublicRating[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let complete = false;
    for (let page = 0; page < PAGE_CAP; page += 1) {
      try {
        const result = await fetchUserRatings(
          handle,
          cursor ? { type: mediaType, cursor } : { type: mediaType },
        );
        for (const item of result.items ?? []) {
          const key = `${item.mediaType}|${item.itemKey}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
        }
        if (!result.nextCursor || result.nextCursor === cursor) {
          complete = true;
          break;
        }
        cursor = result.nextCursor;
      } catch (error) {
        // A refused history is final; a flaky page is retried the next time the panel opens.
        const status = (error as { status?: number }).status;
        if (status === 403 || status === 404) complete = true;
        break;
      }
    }
    const history = { items, complete };
    if (items.length || complete) historyCache.set(key, { at: Date.now(), history });
    return history;
  })().finally(() => historyInflight.delete(key));

  historyInflight.set(key, task);
  return task;
}

async function scanAuthors(
  authors: readonly AuthorMeta[],
  target: TitleRef,
): Promise<{ ratings: TitleRating[]; complete: boolean }> {
  await resolveTitleIdentity(target);
  const ratings: TitleRating[] = [];
  let complete = true;
  for (let i = 0; i < authors.length; i += CONCURRENCY) {
    const slice = authors.slice(i, i + CONCURRENCY);
    const scans = await Promise.all(
      slice.map(async (author) => ({
        author,
        history: await scanHistory(author.handle, target.mediaType),
      })),
    );
    for (const { author, history } of scans) {
      if (!history.complete) complete = false;
      const raw = pickTitleRating(history.items, target);
      const rating = raw ? titleRatingFrom(raw, author) : null;
      if (rating) ratings.push(rating);
    }
  }
  return { ratings, complete };
}

export type TitleRatingsSnapshot = {
  ratings: TitleRating[];
  /** False when a history or the author list was cut short, so a review may still be missing. */
  complete: boolean;
  scanned: number;
  /** The viewer has no Harbor account, so there is no friend list to read. */
  signedOut: boolean;
  /** "hub" is the server-side review list; "scan" is the older per-profile fallback. */
  source?: "hub" | "scan";
  matchesIncomplete?: boolean;
};

/** Friends' ratings of one title, which is what the avatar stack and the Friends tab show. */
export async function loadFriendTitleRatings(
  target: TitleRef,
  includeMatch = false,
): Promise<TitleRatingsSnapshot> {
  const self = currentAuthor();
  if (!self?.handle) return { ratings: [], complete: true, scanned: 0, signedOut: true };

  const hub = await loadHubTitleRatings(target, "friends", self.handle, false, includeMatch);
  if (hub) return hub;

  let friends: Friend[];
  try {
    friends = await fetchFriends();
  } catch (error) {
    const status = (error as { status?: number }).status;
    return { ratings: [], complete: status !== 401, scanned: 0, signedOut: status === 401 };
  }

  const authors = friends.map(toAuthorMeta);
  const { ratings, complete } = await scanAuthors(authors, target);
  return {
    ratings: mergeTitleRatings(ratings, target, self.handle),
    complete,
    scanned: authors.length,
    signedOut: false,
    source: "scan",
  };
}

/**
 * Everyone: your friends plus the public community graph. This is deliberately loaded only when
 * the Everyone tab is opened, because it costs one history scan per person.
 */
async function loadCommunityTitleRatings(
  target: TitleRef,
  includeMatch = true,
): Promise<TitleRatingsSnapshot> {
  const self = currentAuthor();
  const hub = await loadHubTitleRatings(
    target,
    "all",
    self?.handle ?? undefined,
    !self?.handle,
    includeMatch,
  );
  if (hub) return hub;

  const authors = new Map<string, AuthorMeta>();
  const add = (meta: AuthorMeta) => {
    const key = foldHandle(meta.handle);
    if (!key) return;
    const existing = authors.get(key);
    if (!existing) {
      authors.set(key, { ...meta });
      return;
    }
    if (!existing.avatarUrl && meta.avatarUrl) existing.avatarUrl = meta.avatarUrl;
    if (!existing.alias && meta.alias) existing.alias = meta.alias;
  };

  let signedOut = !self?.handle;
  if (self?.handle) {
    try {
      for (const friend of await fetchFriends()) add(toAuthorMeta(friend));
    } catch (error) {
      if ((error as { status?: number }).status === 401) signedOut = true;
    }
  }

  let truncated = false;
  try {
    const directory = await loadUserDirectory();
    for (const user of directory.users) {
      add({
        handle: user.handle,
        alias: user.alias,
        avatarUrl: user.avatarUrl,
        verified: user.verified,
      });
    }
    truncated = directory.truncated;
  } catch {
    truncated = true;
  }

  const pool = [...authors.values()].slice(0, COMMUNITY_CAP);
  const { ratings, complete } = await scanAuthors(pool, target);
  return {
    ratings: mergeTitleRatings(ratings, target, self?.handle),
    complete: complete && !truncated && authors.size <= COMMUNITY_CAP,
    scanned: pool.length,
    signedOut,
    source: "scan",
  };
}

export type TitleRatingSummary = {
  averageScore: number | null;
  recentRatings: TitleRating[];
  friends: TitleRating[];
  total: number;
};

const summaryCache = new Map<string, { at: number; promise: Promise<TitleRatingSummary> }>();

/** Shares the visible rating pool and bundled match scores with Social Reviews. */
export function loadTitleRatingSummary(target: TitleRef): Promise<TitleRatingSummary> {
  const key = `${currentAuthor()?.id ?? "anon"}|${target.mediaType}|${target.itemKey}`;
  const hit = summaryCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.promise;
  const isCurrent = captureSessionScope();
  const promise = Promise.all([
    loadCommunityTitleRatings(target),
    loadFriendTitleRatings(target, true),
  ])
    .then(([snapshot, friends]) => {
      if (!isCurrent()) throw new Error("Account changed");
      const ratings = mergeTitleRatings(
        [...snapshot.ratings, ...friends.ratings],
        target,
        currentAuthor()?.handle,
      );
      const totalScore = ratings.reduce((total, rating) => total + rating.score, 0);
      return {
        averageScore: ratings.length ? Math.round((totalScore / ratings.length) * 10) / 10 : null,
        recentRatings: ratings.slice(0, 3),
        friends: friends.ratings,
        total: ratings.length,
      };
    })
    .catch((error) => {
      if (summaryCache.get(key)?.promise === promise) summaryCache.delete(key);
      throw error;
    });
  summaryCache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Publish the title's reviews and match scores together, even on older servers. */
export async function loadTitleReviewsWithMatches(
  target: TitleRef,
  scope: "friends" | "everyone",
): Promise<TitleRatingsSnapshot> {
  const viewer = currentAuthor();
  const isCurrent = captureSessionScope();
  const snapshot =
    scope === "friends"
      ? await loadFriendTitleRatings(target, true)
      : await loadCommunityTitleRatings(target);
  if (!isCurrent()) throw new Error("Account changed");
  if (
    !viewer ||
    snapshot.signedOut ||
    snapshot.ratings.every((rating) => rating.match !== undefined)
  ) {
    return snapshot;
  }
  const matches = await Promise.allSettled(
    snapshot.ratings.map((rating) => rating.match ?? getMutualMatch(viewer.id, rating.handle)),
  );
  if (!isCurrent()) throw new Error("Account changed");
  return {
    ...snapshot,
    ratings: snapshot.ratings.map((rating, i) => {
      const match = matches[i];
      return match.status === "fulfilled" ? { ...rating, match: match.value } : rating;
    }),
    matchesIncomplete: matches.some((match) => match.status === "rejected"),
  };
}

/** Drops every cached history, so the next open reflects ratings changed elsewhere. */
export function invalidateTitleReviewCaches(): void {
  hubCache.clear();
  historyCache.clear();
  summaryCache.clear();
}
