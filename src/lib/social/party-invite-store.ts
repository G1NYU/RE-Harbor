import { useSyncExternalStore } from "react";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { emitTogetherInvite } from "@/lib/together/invite";
import {
  acceptPartyInvite,
  declinePartyInvite,
  listPartyInvites,
  type PartyInvite,
  type PartyInviteList,
} from "./party-invites";

// Pending watch-party invitations, kept in one place so the bell, the launcher and
// the party UI cannot disagree about what is outstanding.

export type PartyInviteState = {
  authed: boolean;
  pending: PartyInvite[];
  recent: PartyInvite[];
  loading: boolean;
  error: string | null;
};

const POLL_MS = 30_000;

let state: PartyInviteState = {
  authed: !!currentAuthor(),
  pending: [],
  recent: [],
  loading: false,
  error: null,
};

const listeners = new Set<() => void>();
const openListeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let stopPolling: (() => void) | null = null;

function emit(): void {
  for (const fn of listeners) fn();
}

function setState(next: Partial<PartyInviteState>): void {
  state = { ...state, ...next };
  emit();
}

export function getPartyInviteState(): PartyInviteState {
  return state;
}

export function subscribePartyInvites(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function usePartyInvites(): PartyInviteState {
  return useSyncExternalStore(subscribePartyInvites, getPartyInviteState, getPartyInviteState);
}

export function refreshPartyInvites(): Promise<void> {
  if (!currentAuthor()) {
    setState({ authed: false, pending: [], recent: [], loading: false });
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  setState({ authed: true, loading: true });
  inFlight = listPartyInvites()
    .then((data: PartyInviteList) => {
      setState({
        pending: data.pending ?? [],
        recent: data.recent ?? [],
        loading: false,
        error: null,
      });
    })
    .catch((err: unknown) => {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "Could not load invitations.",
      });
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Opens the invitations panel. Nothing else in the app needs to know how it is shown. */
export function openPartyInvites(): void {
  void refreshPartyInvites();
  for (const fn of openListeners) fn();
}

export function subscribePartyInvitesOpen(fn: () => void): () => void {
  openListeners.add(fn);
  return () => {
    openListeners.delete(fn);
  };
}

function upsert(invite: PartyInvite): void {
  const pending = state.pending.filter((i) => i.id !== invite.id);
  const recent = [invite, ...state.recent.filter((i) => i.id !== invite.id)].slice(0, 10);
  setState({ pending, recent });
}

export function declineInvite(id: string): Promise<void> {
  return declinePartyInvite(id).then((r) => upsert(r.invite));
}

/**
 * Accepts and hands the room to the Together provider. The invitation never joins a
 * party itself: `emitTogetherInvite` is the same entry point a deep link uses, so
 * there is one join path in the app and playback is not touched until the provider
 * decides to open it.
 */
export function acceptInvite(id: string): Promise<PartyInvite | null> {
  return acceptPartyInvite(id).then((r) => {
    upsert(r.invite);
    const relayUrl = r.join.relayUrl;
    const roomCode = r.join.roomCode;
    if (relayUrl && roomCode) emitTogetherInvite({ relayUrl, roomCode });
    return r.invite;
  });
}

export function startPartyInvitePolling(): () => void {
  if (stopPolling) return stopPolling;
  const timer = setInterval(() => {
    void refreshPartyInvites();
  }, POLL_MS);
  void refreshPartyInvites();
  stopPolling = () => {
    clearInterval(timer);
    stopPolling = null;
  };
  return stopPolling;
}

subscribeAuthor(() => {
  setState({
    authed: !!currentAuthor(),
    pending: currentAuthor() ? state.pending : [],
    recent: currentAuthor() ? state.recent : [],
  });
  if (currentAuthor()) void refreshPartyInvites();
});
