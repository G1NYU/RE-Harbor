/**
 * Pure matching/ordering helpers for user discovery.
 *
 * The Harbor social API exposes no user search route (GET /social/users/search is a 404),
 * so partial-handle matching happens over the set of users this client can actually see:
 * public group members and friends-of-friends. Keeping the ranking free of network and
 * React imports lets it be unit-tested directly and reused by every surface.
 */

export type DirectorySource = "group" | "friend-of-friend" | "friend";

export type DirectoryUser = {
  handle: string;
  alias: string;
  avatarUrl?: string;
  slogan?: string;
  online?: boolean;
  verified?: boolean;
  sources?: DirectorySource[];
};

export function normalizeQuery(query: string): string {
  return query.trim().replace(/^@+/, "").toLowerCase();
}

function tokens(alias: string): string[] {
  return alias
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter(Boolean);
}

/**
 * Lower is better; -1 means "no match".
 * Exact handle beats handle prefix, which beats alias prefix, then word-start, then the
 * loose substring matches. Prefix-on-handle is what makes "BetterA" resolve to
 * BetterAhmed while "BetterC" resolves to BetterCallSaul.
 */
export function directoryMatchScore(user: DirectoryUser, query: string): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  const handle = user.handle.toLowerCase();
  const alias = (user.alias || user.handle).toLowerCase();

  if (handle === q) return 0;
  if (handle.startsWith(q)) return 1;
  if (alias.startsWith(q)) return 2;
  if (tokens(alias).some((token) => token.startsWith(q))) return 3;
  if (handle.includes(q)) return 4;
  if (alias.includes(q)) return 5;
  return -1;
}

/** Matching users, best first. An empty query returns the browse order (online, then A–Z). */
export function rankDirectoryUsers(
  users: readonly DirectoryUser[],
  query: string,
  limit = 60,
): DirectoryUser[] {
  const q = normalizeQuery(query);
  if (!q) {
    return [...users]
      .sort((a, b) => {
        if (!!a.online !== !!b.online) return a.online ? -1 : 1;
        return (a.alias || a.handle).localeCompare(b.alias || b.handle);
      })
      .slice(0, limit);
  }
  const scored: Array<{ user: DirectoryUser; score: number }> = [];
  for (const user of users) {
    const score = directoryMatchScore(user, q);
    if (score < 0) continue;
    scored.push({ user, score });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (!!a.user.online !== !!b.user.online) return a.user.online ? -1 : 1;
    return (a.user.alias || a.user.handle).localeCompare(b.user.alias || b.user.handle);
  });
  return scored.slice(0, limit).map((s) => s.user);
}

/** Case-insensitive handle de-duplication; the first sighting wins but sources merge. */
export function dedupeDirectoryUsers(users: readonly DirectoryUser[]): DirectoryUser[] {
  const seen = new Map<string, DirectoryUser>();
  for (const user of users) {
    const key = user.handle.trim().toLowerCase();
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...user, handle: user.handle.trim() });
      continue;
    }
    const sources = new Set<DirectorySource>([
      ...(existing.sources ?? []),
      ...(user.sources ?? []),
    ]);
    seen.set(key, {
      ...existing,
      avatarUrl: existing.avatarUrl ?? user.avatarUrl,
      slogan: existing.slogan ?? user.slogan,
      verified: existing.verified ?? user.verified,
      online: existing.online ?? user.online,
      sources: [...sources],
    });
  }
  return [...seen.values()];
}

/**
 * Removes the signed-in user and anyone a friend request cannot be sent to. Exclusions are
 * compared case-insensitively because the API returns handles with mixed casing.
 */
export function excludeDirectoryUsers(
  users: readonly DirectoryUser[],
  opts: { self?: string | null; exclude?: Iterable<string>; handles?: Iterable<string> },
): DirectoryUser[] {
  const blocked = new Set<string>();
  for (const handle of opts.exclude ?? []) blocked.add(handle.trim().toLowerCase());
  for (const handle of opts.handles ?? []) blocked.add(handle.trim().toLowerCase());
  const self = opts.self?.trim().toLowerCase();
  if (self) blocked.add(self);
  return users.filter((u) => !blocked.has(u.handle.trim().toLowerCase()));
}

export function pageUsers(
  users: readonly DirectoryUser[],
  visible: number,
): { items: DirectoryUser[]; hasMore: boolean } {
  const size = Math.max(0, visible);
  return { items: users.slice(0, size), hasMore: users.length > size };
}

/** True when the query is shaped like one complete handle, worth an exact profile lookup. */
export function looksLikeHandle(query: string): boolean {
  const q = normalizeQuery(query);
  return q.length >= 2 && !/[\s/?#]/.test(q);
}
