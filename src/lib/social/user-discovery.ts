import type { FriendStatus } from "./friend-command";
import type { MutualMatch } from "./mutual-score";
import { socialGet } from "./client";

export type DiscoveryOrder = "username" | "activity" | "reviews" | "newest" | "oldest";
export type DiscoverySort = "newest" | "oldest" | "random" | DiscoveryOrder;
export type DiscoveredUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verified: boolean;
  memberSince?: string;
  showJoinDate?: boolean;
  ratingCount: number;
  hasCanvas: boolean;
  match?: MutualMatch;
  friendStatus?: FriendStatus;
  friendEdgeId?: string;
};
export type UserDiscoveryPage = {
  filterVersion?: number;
  users: DiscoveredUser[];
  total: number;
  nextCursor?: string;
};
export type UserDiscoveryFilters = {
  query: string;
  sort: DiscoverySort;
  orders?: DiscoveryOrder[];
  seed?: string;
  reviewDirection?: "asc" | "desc";
  rated: boolean;
  canvas: boolean;
  minRatings?: number;
  match?: boolean;
  minMatch?: number;
  minShared?: number;
};

export function fetchDiscoveredUsers(
  filters: UserDiscoveryFilters,
  signal?: AbortSignal,
  cursor?: string,
): Promise<UserDiscoveryPage> {
  const query = filters.query.trim().replace(/^@+/, "");
  const params = new URLSearchParams({
    sort: filters.sort,
    limit: "24",
  });
  const dateSort = filters.sort === "newest" || filters.sort === "oldest";
  if (filters.orders?.length && !dateSort) params.set("order", filters.orders.join(","));
  if (filters.orders?.length === 1 && filters.orders[0] === "reviews" && filters.reviewDirection)
    params.set("reviewDirection", filters.reviewDirection);
  if (filters.seed) params.set("seed", filters.seed);
  if (query) params.set("q", query);
  if (filters.rated) params.set("rated", "1");
  if (filters.rated) params.set("minRatings", String(filters.minRatings ?? 1));
  if (filters.match) {
    params.set("minMatch", String(filters.minMatch ?? 50));
    params.set("minShared", String(filters.minShared ?? 10));
  }
  if (filters.canvas) params.set("canvas", "1");
  if (cursor) params.set("cursor", cursor);
  return socialGet<UserDiscoveryPage>(`/social/users?${params.toString()}`, signal).then((page) => {
    if (
      filters.reviewDirection === "asc" &&
      filters.orders?.length === 1 &&
      filters.orders[0] === "reviews" &&
      (page.filterVersion ?? 0) < 4
    )
      throw new Error("These discovery filters require the latest backend deployment.");
    if (
      (filters.sort === "random" || (!dateSort && filters.orders?.length)) &&
      (page.filterVersion ?? 0) < 3
    )
      throw new Error("These discovery filters require the latest backend deployment.");
    if (
      (filters.match || (filters.rated && (filters.minRatings ?? 1) > 1)) &&
      (page.filterVersion ?? 0) < 2
    )
      throw new Error("These discovery filters require the latest backend deployment.");
    return page;
  });
}
