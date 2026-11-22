import { useSyncExternalStore } from "react";
import { captureSessionScope, currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import {
  listDmConversations,
  openDmConversation as openConversation,
  sendDmMessage as sendMessage,
  hideDmConversation as hideConversation,
  type DmConversation,
  type DmLastMessage,
  type DmMessage,
  type DmShare,
} from "./dm";

export type DmState = {
  authed: boolean;
  conversations: DmConversation[];
  unread: number;
  loading: boolean;
  error: string | null;
};

export type DmIncoming = {
  conversation: DmConversation;
  message: DmLastMessage;
};

const POLL_MS = 15_000;

let state: DmState = {
  authed: !!currentAuthor(),
  conversations: [],
  unread: 0,
  loading: false,
  error: null,
};
const listeners = new Set<() => void>();
const incomingListeners = new Set<(event: DmIncoming) => void>();
const previewListeners = new Set<() => void>();

let inFlight: Promise<void> | null = null;
let inboxVersion = 0;
let inboxController: AbortController | null = null;
let isStoreSessionCurrent = captureSessionScope();
let initialLoaded = false;
const lastSeenMessage = new Map<string, string>();
// An opened thread can be absent from an older server's hidden inbox response.
const openedConversations = new Map<string, DmConversation>();
let stopPolling: (() => void) | null = null;

function emit(): void {
  for (const fn of listeners) fn();
}

function setState(next: Partial<DmState>): void {
  state = { ...state, ...next };
  emit();
}

export function getDmState(): DmState {
  return state;
}

export function subscribeDm(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDmState(): DmState {
  return useSyncExternalStore(subscribeDm, getDmState, getDmState);
}

function getDmUnreadBadgeCount(): number {
  return state.unread;
}

export function useDmUnreadBadgeCount(): number {
  return useSyncExternalStore(subscribeDm, getDmUnreadBadgeCount, getDmUnreadBadgeCount);
}

export function subscribeDmIncoming(fn: (event: DmIncoming) => void): () => void {
  incomingListeners.add(fn);
  return () => {
    incomingListeners.delete(fn);
  };
}

export function subscribeDmToastPreview(fn: () => void): () => void {
  previewListeners.add(fn);
  return () => {
    previewListeners.delete(fn);
  };
}

export function requestDmToastPreview(): void {
  for (const fn of previewListeners) fn();
}

export function dmConversationById(id: string | null): DmConversation | null {
  if (!id) return null;
  return state.conversations.find((c) => c.id === id) ?? openedConversations.get(id) ?? null;
}

export async function openDmConversation(userId: string): Promise<DmConversation> {
  const isCurrent = captureSessionScope();
  const conversation = await openConversation(userId);
  if (isCurrent()) {
    openedConversations.set(conversation.id, conversation);
    emit();
  }
  return conversation;
}

export async function sendDmMessage(
  conversationId: string,
  body: string,
  share?: DmShare,
): Promise<DmMessage> {
  const isCurrent = captureSessionScope();
  const message = await sendMessage(conversationId, body, share);
  if (!isCurrent()) return message;
  inboxVersion++;
  const conversation = dmConversationById(conversationId);
  if (conversation) {
    const next = {
      ...conversation,
      at: message.at,
      lastMessage: { id: message.id, body: message.body, at: message.at, mine: true },
    };
    openedConversations.set(conversationId, next);
    const conversations = [
      next,
      ...state.conversations.filter((row) => row.id !== conversationId),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    setState({ conversations });
  }
  void refreshDm({ silent: true, afterMutation: true });
  return message;
}

export async function hideDmConversation(conversationId: string): Promise<{ ok: boolean }> {
  const isCurrent = captureSessionScope();
  const result = await hideConversation(conversationId);
  if (isCurrent()) {
    inboxVersion++;
    openedConversations.delete(conversationId);
    const conversations = state.conversations.filter((row) => row.id !== conversationId);
    setState({
      conversations,
      unread: conversations.reduce((total, row) => total + row.unread, 0),
    });
    await refreshDm({ silent: true, afterMutation: true });
  }
  return result;
}

function notifyIncoming(event: DmIncoming): void {
  for (const fn of incomingListeners) fn(event);
}

function detectIncoming(rows: DmConversation[]): void {
  const seen = new Set<string>();
  for (const conv of rows) {
    seen.add(conv.id);
    const last = conv.lastMessage;
    const prev = lastSeenMessage.get(conv.id);
    if (last) lastSeenMessage.set(conv.id, last.id);
    if (!initialLoaded || !last || last.mine) continue;
    // A new message id is enough; a conversation that first appears already unread
    // is a genuinely new thread, not a replay of old history.
    if (prev ? prev !== last.id : conv.unread > 0)
      notifyIncoming({ conversation: conv, message: last });
  }
  for (const id of lastSeenMessage.keys()) {
    if (!seen.has(id)) lastSeenMessage.delete(id);
  }
}

function resetDmSession(): void {
  inboxVersion++;
  inboxController?.abort();
  inboxController = null;
  inFlight = null;
  openedConversations.clear();
  initialLoaded = false;
  lastSeenMessage.clear();
  isStoreSessionCurrent = captureSessionScope();
  setState({
    authed: !!currentAuthor(),
    conversations: [],
    unread: 0,
    loading: false,
    error: null,
  });
}

export async function refreshDm(
  opts: { silent?: boolean; signal?: AbortSignal; afterMutation?: boolean } = {},
): Promise<void> {
  if (!isStoreSessionCurrent()) resetDmSession();
  if (!currentAuthor()) {
    openedConversations.clear();
    initialLoaded = false;
    lastSeenMessage.clear();
    setState({ authed: false, conversations: [], unread: 0, loading: false, error: null });
    return;
  }
  if (inFlight) {
    if (opts.afterMutation) {
      const isCurrent = captureSessionScope();
      return inFlight.then(() => {
        if (isCurrent()) return refreshDm({ ...opts, afterMutation: false });
      });
    }
    return inFlight;
  }
  const version = inboxVersion;
  const isCurrent = captureSessionScope();
  if (!opts.silent) setState({ loading: true, error: null });
  const controller = new AbortController();
  inboxController = controller;
  const signal = opts.signal
    ? AbortSignal.any([controller.signal, opts.signal])
    : controller.signal;
  const request = listDmConversations(signal)
    .then((res) => {
      if (signal.aborted || !isCurrent() || version !== inboxVersion) return;
      if (!currentAuthor()) {
        initialLoaded = false;
        lastSeenMessage.clear();
        setState({ authed: false, conversations: [], unread: 0, loading: false, error: null });
        return;
      }
      const conversations = Array.isArray(res.conversations) ? res.conversations : [];
      for (const conversation of conversations) {
        if (openedConversations.has(conversation.id))
          openedConversations.set(conversation.id, conversation);
      }
      const unread = Number(res.unread) || 0;
      detectIncoming(conversations);
      initialLoaded = true;
      setState({ authed: true, conversations, unread, loading: false, error: null });
    })
    .catch((err: unknown) => {
      if (signal.aborted || !isCurrent() || version !== inboxVersion) return;
      if ((err as { name?: string }).name === "AbortError") return;
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Messages could not be loaded.",
      });
    })
    .finally(() => {
      if (inFlight === request) {
        inFlight = null;
        inboxController = null;
        if (signal.aborted) setState({ loading: false });
      }
    });
  inFlight = request;
  return request;
}

// Account isolation belongs to the shared store, including when polling is not mounted.
subscribeAuthor(() => {
  if (isStoreSessionCurrent()) return;
  resetDmSession();
  if (stopPolling) void refreshDm();
});

/** Idempotent process-wide polling. The launcher owns the mount for the app's lifetime. */
export function startDmPolling(): () => void {
  if (stopPolling) return stopPolling;

  void refreshDm();
  const tick = () => {
    if (document.hidden) return;
    void refreshDm({ silent: true });
  };
  const timer = window.setInterval(tick, POLL_MS);
  const onVisible = () => {
    if (!document.hidden) void refreshDm({ silent: true });
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", tick);

  stopPolling = () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", tick);
    stopPolling = null;
  };
  return stopPolling;
}

/** A navigation or share surface can ask the launcher to open without prop drilling. */
const openRequests = new Set<(conversationId?: string) => void>();

export function requestOpenDm(conversationId?: string): void {
  for (const fn of openRequests) fn(conversationId);
}

export function subscribeOpenDm(fn: (conversationId?: string) => void): () => void {
  openRequests.add(fn);
  return () => {
    openRequests.delete(fn);
  };
}
