import { sendFriendRequest } from "./friends";

/** The row states every "add someone" surface renders. */
export type FriendRowState = "idle" | "sending" | "requested" | "friends" | "blocked" | "self";
export type ProfileFriendStatus = "none" | "friends" | "outgoing" | "incoming" | "blocked";

export function friendRowState(
  handle: string,
  opts: {
    self?: string | null;
    friends?: Iterable<string>;
    pending?: Iterable<string>;
    local?: Record<string, FriendRowState>;
  },
): FriendRowState {
  const key = handle.trim().toLowerCase();
  if (!key) return "idle";
  const local = opts.local?.[key];
  if (local && local !== "idle") return local;
  if (key === (opts.self ?? "").trim().toLowerCase()) return "self";
  for (const friend of opts.friends ?? []) {
    if (friend.trim().toLowerCase() === key) return "friends";
  }
  for (const request of opts.pending ?? []) {
    if (request.trim().toLowerCase() === key) return "requested";
  }
  return "idle";
}

/**
 * Resolve Quick Access relationship state from authoritative profile data or friend lists.
 * An undefined list means its request failed, so a negative result is not safe to act on.
 */
export function resolveQuickFriendship(
  handle: string,
  profileStatus: ProfileFriendStatus | undefined,
  opts: {
    self?: string | null;
    friends?: readonly string[];
    pending?: readonly string[];
  },
): { state: FriendRowState; known: boolean } {
  const key = handle.trim().toLowerCase();
  if (!key) return { state: "idle", known: true };
  if (key === (opts.self ?? "").trim().toLowerCase()) return { state: "self", known: true };

  if (profileStatus === "friends") return { state: "friends", known: true };
  if (profileStatus === "incoming" || profileStatus === "outgoing")
    return { state: "requested", known: true };
  if (profileStatus === "blocked") return { state: "blocked", known: true };
  if (profileStatus === "none") return { state: "idle", known: true };

  const listedAsFriend = opts.friends?.some((friend) => friend.trim().toLowerCase() === key);
  if (listedAsFriend) return { state: "friends", known: true };
  const pendingRequest = opts.pending?.some((pending) => pending.trim().toLowerCase() === key);
  if (pendingRequest) return { state: "requested", known: true };
  if (opts.friends && opts.pending) return { state: "idle", known: true };
  return { state: "idle", known: false };
}

/** Hide stale relationship indicators while the current profile's state is unresolved. */
export function visibleQuickFriendship(state: FriendRowState, known: boolean): FriendRowState {
  return known ? state : "idle";
}

export function friendRowLabel(state: FriendRowState): string {
  if (state === "friends") return "This user is your friend.";
  if (state === "blocked") return "This user is blocked.";
  if (state === "requested") return "Friend request pending";
  if (state === "sending") return "Sending friend request…";
  return "Add friend";
}

/**
 * Sends a friend request and reports the row state to render. A source that answers
 * "already friends/pending" is a settled state, not an error, so it is folded back into
 * the row instead of surfacing a failure the user cannot act on.
 */
export async function requestFriendship(handle: string): Promise<"requested" | "friends"> {
  const { edge } = await sendFriendRequest(handle);
  return edge.status === "accepted" || edge.status === "friends" ? "friends" : "requested";
}

export function isAlreadyRelatedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /already|friend|pending|exists|request/i.test(message);
}
