/**
 * User directory assembly.
 *
 * The Harbor social API has no user listing route: GET /social/users, /social/users/search,
 * /social/people and /social/members all answer 404. What it does serve publicly is:
 *   - GET /social/groups/discover      public groups, each with memberPreview[]
 *   - GET /social/groups/{id}          a public group's member list
 *   - GET /social/u/{handle}/friends   any profile's accepted friends
 *
 * So the directory is built from that graph — group members plus friends-of-friends —
 * and never invents users. Coverage is therefore "people reachable through public
 * community surfaces", not literally every account. See DIRECTORY_LIMITATION.
 */

import { socialGet } from "./client";
import { fetchPublicGroups, fetchGroup, type Group } from "./groups";
import type { DirectoryUser, DirectorySource } from "./directory-rank";
import { dedupeDirectoryUsers } from "./directory-rank";

export const DIRECTORY_LIMITATION =
  "Harbor's API exposes no all-users endpoint, so this directory lists people reachable " +
  "through public groups and friends-of-friends.";

/** Groups fetched from discover (each page is one request). */
const DISCOVER_PAGES = 3;
/** Public groups expanded into their full member list. */
const DETAIL_GROUP_LIMIT = 8;
/** Handles whose accepted-friends list we expand. */
const FOAF_SEED_LIMIT = 16;
/** Hop limits keep the crawl bounded; six concurrent requests are allowed per app. */
const MAX_INFLIGHT = 4;
const CACHE_TTL = 5 * 60 * 1000;

type FriendRow = {
  handle?: string;
  alias?: string;
  avatarUrl?: string;
  slogan?: string;
  online?: boolean;
  status?: string;
};

type MiniUser = {
  handle?: string;
  alias?: string;
  avatarUrl?: string;
  verified?: boolean;
  slogan?: string;
  online?: boolean;
};

type Accumulator = Map<string, DirectoryUser>;

function keyOf(handle: string | undefined): string {
  return (handle ?? "").trim().toLowerCase();
}

function addUser(acc: Accumulator, user: MiniUser | FriendRow, source: DirectorySource): void {
  const handle = (user.handle ?? "").trim();
  const key = keyOf(handle);
  if (!key) return;
  const existing = acc.get(key);
  const nextSources = new Set<DirectorySource>(existing?.sources ?? []);
  nextSources.add(source);
  acc.set(key, {
    handle: existing?.handle ?? handle,
    alias: (user.alias || existing?.alias || handle).trim(),
    avatarUrl: existing?.avatarUrl ?? (user.avatarUrl || undefined),
    slogan: existing?.slogan ?? ("slogan" in user ? user.slogan || undefined : undefined),
    online: existing?.online ?? ("online" in user ? !!user.online : undefined),
    verified: existing?.verified ?? ("verified" in user ? !!user.verified : undefined),
    sources: [...nextSources],
  });
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const slice = items.slice(i, i + limit);
    const settled = await Promise.allSettled(slice.map(fn));
    for (const result of settled) {
      if (result.status === "fulfilled") out.push(result.value);
    }
  }
  return out;
}

async function discoverGroups(signal?: AbortSignal): Promise<Group[]> {
  const groups: Group[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < DISCOVER_PAGES; page++) {
    const data = await fetchPublicGroups(cursor ? { cursor } : {}, signal);
    groups.push(...(data.groups ?? []));
    cursor = data.nextCursor;
    if (!cursor) break;
  }
  return groups;
}

async function groupMembers(group: Group, signal?: AbortSignal): Promise<FriendRow[]> {
  try {
    const detail = await fetchGroup(group.id, signal);
    return Array.isArray(detail.members) ? detail.members : [];
  } catch {
    return [];
  }
}

async function publicFriends(handle: string, signal?: AbortSignal): Promise<FriendRow[]> {
  try {
    const rows = await socialGet<FriendRow[]>(
      `/social/u/${encodeURIComponent(handle)}/friends`,
      signal,
    );
    return Array.isArray(rows) ? rows.filter((r) => (r.status ?? "accepted") === "accepted") : [];
  } catch {
    // 404 for unknown handles, or a profile that keeps friends private.
    return [];
  }
}

export type DirectorySnapshot = {
  users: DirectoryUser[];
  /** Public groups scanned for members. */
  groupsScanned: number;
  /** True when the graph walk stopped at its configured limits. */
  truncated: boolean;
};

let cache: { at: number; snapshot: DirectorySnapshot } | null = null;
let inflight: Promise<DirectorySnapshot> | null = null;

export function clearUserDirectoryCache(): void {
  cache = null;
}

/**
 * Walks the public social graph once per TTL and memoises the result. Concurrent callers
 * share the in-flight request so typing in a search box cannot stampede the API.
 */
export async function loadUserDirectory(
  opts: {
    signal?: AbortSignal;
    force?: boolean;
  } = {},
): Promise<DirectorySnapshot> {
  if (!opts.force && cache && Date.now() - cache.at < CACHE_TTL) return cache.snapshot;
  if (inflight) return inflight;

  inflight = (async (): Promise<DirectorySnapshot> => {
    const acc: Accumulator = new Map();
    const groups = await discoverGroups(opts.signal);
    for (const group of groups) {
      for (const member of group.memberPreview ?? []) addUser(acc, member, "group");
    }

    // Expand the largest public groups: memberPreview only carries the first few people.
    const expandable = [...groups]
      .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
      .slice(0, DETAIL_GROUP_LIMIT);
    const memberLists = await mapLimit(expandable, MAX_INFLIGHT, (group) =>
      groupMembers(group, opts.signal),
    );
    for (const members of memberLists) {
      for (const member of members) addUser(acc, member, "group");
    }

    // Friends-of-friends: the only way the public API reveals people outside groups.
    const seeds = [...acc.keys()].slice(0, FOAF_SEED_LIMIT);
    const friendLists = await mapLimit(seeds, MAX_INFLIGHT, (handle) =>
      publicFriends(handle, opts.signal),
    );
    for (const friends of friendLists) {
      for (const friend of friends) addUser(acc, friend, "friend-of-friend");
    }

    const snapshot: DirectorySnapshot = {
      users: dedupeDirectoryUsers([...acc.values()]),
      groupsScanned: groups.length,
      truncated: groups.length >= DISCOVER_PAGES || expandable.length >= DETAIL_GROUP_LIMIT,
    };
    cache = { at: Date.now(), snapshot };
    return snapshot;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
