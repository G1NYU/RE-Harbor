import { socialDelete, socialGet, socialPatch, socialPost } from "./client";

export type DmPresence = "online" | "away" | "dnd" | "offline";

export type DmUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verified?: boolean;
  presence?: DmPresence;
};

export type DmLastMessage = {
  id: string;
  body: string;
  at: string;
  mine: boolean;
  deleted?: boolean;
};

export type DmConversation = {
  id: string;
  other: DmUser | null;
  lastMessage?: DmLastMessage;
  unread: number;
  muted: boolean;
  otherReadAt?: string;
  at: string;
};

export type DmSender = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
};

export type DmReaction = { emoji: string; count: number; mine: boolean };

/** A reference to Harbor content. The client renders it; the server validated it. */
export type DmShare = {
  type: "profile" | "group" | "title" | "review" | "list";
  id: string;
  title?: string;
  poster?: string;
};

export type DmMessage = {
  id: string;
  conversationId: string;
  body: string;
  at: string;
  edited?: boolean;
  deleted?: boolean;
  mine: boolean;
  reactions: DmReaction[];
  share?: DmShare;
  sender: DmSender | null;
};

export type DmInbox = { conversations: DmConversation[]; unread: number };
export type DmMessagePage = { messages: DmMessage[]; nextCursor?: string; total: number };

export type DmDirectoryUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verified?: boolean;
};

export type DmError = Error & { status?: number; code?: string; body?: unknown };

export async function listDmConversations(signal?: AbortSignal): Promise<DmInbox> {
  return socialGet<DmInbox>("/social/dm/conversations", signal);
}

export async function openDmConversation(userId: string): Promise<DmConversation> {
  try {
    const res = await socialPost<{ conversation: DmConversation }>("/social/dm/conversations", {
      userId,
    });
    return res.conversation;
  } catch (err) {
    const e = err as DmError;
    const code = (e.body as { error?: string } | undefined)?.error;
    if (code === "dm_friends_only") {
      const friendly = new Error("This person only accepts messages from friends.") as DmError;
      friendly.code = code;
      friendly.status = 403;
      throw friendly;
    }
    if (code === "blocked") {
      const friendly = new Error("You cannot message this person.") as DmError;
      friendly.code = code;
      friendly.status = 403;
      throw friendly;
    }
    throw err;
  }
}

export async function listDmMessages(
  conversationId: string,
  opts: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<DmMessagePage> {
  const q = new URLSearchParams();
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.cursor) q.set("cursor", opts.cursor);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return socialGet<DmMessagePage>(
    `/social/dm/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`,
    signal,
  );
}

export async function sendDmMessage(
  conversationId: string,
  body: string,
  share?: DmShare,
): Promise<DmMessage> {
  return socialPost<DmMessage>(
    `/social/dm/conversations/${encodeURIComponent(conversationId)}/messages`,
    { body, share: share || undefined },
  );
}

export async function editDmMessage(messageId: string, body: string): Promise<DmMessage> {
  return socialPatch<DmMessage>(`/social/dm/messages/${encodeURIComponent(messageId)}`, { body });
}

export async function deleteDmMessage(messageId: string): Promise<{ ok: boolean }> {
  return socialDelete<{ ok: boolean }>(`/social/dm/messages/${encodeURIComponent(messageId)}`);
}

/** One emoji per call, toggled by the caller. Idempotent on the server. */
export async function reactToDmMessage(messageId: string, emoji: string): Promise<DmMessage> {
  return socialPost<DmMessage>(`/social/dm/messages/${encodeURIComponent(messageId)}/reaction`, {
    emoji,
  });
}

export async function unreactToDmMessage(messageId: string, emoji: string): Promise<DmMessage> {
  return socialDelete<DmMessage>(
    `/social/dm/messages/${encodeURIComponent(messageId)}/reaction?${new URLSearchParams({ emoji }).toString()}`,
  );
}

export async function markDmRead(conversationId: string): Promise<{ ok: boolean; unread: number }> {
  return socialPost<{ ok: boolean; unread: number }>(
    `/social/dm/conversations/${encodeURIComponent(conversationId)}/read`,
  );
}

export async function setDmMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; muted: boolean }> {
  const path = `/social/dm/conversations/${encodeURIComponent(conversationId)}/mute`;
  return muted
    ? socialPost<{ ok: boolean; muted: boolean }>(path)
    : socialDelete<{ ok: boolean; muted: boolean }>(path);
}

export async function hideDmConversation(conversationId: string): Promise<{ ok: boolean }> {
  return socialPost<{ ok: boolean }>(
    `/social/dm/conversations/${encodeURIComponent(conversationId)}/hide`,
  );
}

export async function searchDmUsers(
  query: string,
  signal?: AbortSignal,
): Promise<DmDirectoryUser[]> {
  const q = new URLSearchParams({ q: query.trim(), limit: "12", sort: "relevance" });
  const res = await socialGet<{ users: DmDirectoryUser[] }>(
    `/social/users?${q.toString()}`,
    signal,
  );
  return Array.isArray(res.users) ? res.users : [];
}
