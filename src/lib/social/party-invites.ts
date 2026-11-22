import { socialDelete, socialGet, socialPost } from "./client";

// Watch-party invitations. The party itself is the relay's, so nothing here creates
// or joins one: an invitation carries a room code and the relay base, and joining is
// the path the app already has (emitTogetherInvite / the harbour-room deep link).

export type PartyInviteStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";

export type PartyInvitePerson = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verified?: boolean;
  presence?: "online" | "away" | "dnd" | "offline";
};

export type PartyInvite = {
  id: string;
  status: PartyInviteStatus;
  direction: "incoming" | "outgoing";
  roomCode: string;
  relayUrl?: string;
  mediaTitle?: string;
  mediaId?: string;
  posterUrl?: string;
  from: PartyInvitePerson | null;
  to: PartyInvitePerson | null;
  createdAt: string;
  expiresAt: string;
  respondedAt?: string;
  expired?: boolean;
};

export type PartyJoinTarget = {
  roomCode: string;
  relayUrl: string | null;
  mediaTitle: string | null;
  mediaId: string | null;
  path: string;
};

export type PartyInviteList = {
  pending: PartyInvite[];
  recent: PartyInvite[];
  pendingCount: number;
};

export type SendPartyInvitesInput = {
  roomCode: string;
  relayUrl?: string;
  mediaTitle?: string;
  mediaId?: string;
  posterUrl?: string;
  ttlMs?: number;
  userIds: string[];
};

export type SendPartyInvitesResult = {
  invites: PartyInvite[];
  skipped: { userId: string; reason: string }[];
};

export function listPartyInvites(signal?: AbortSignal): Promise<PartyInviteList> {
  return socialGet<PartyInviteList>("/social/parties/invites", signal);
}

export function listRoomPartyInvites(
  roomCode: string,
  signal?: AbortSignal,
): Promise<{ pending: PartyInvite[]; recent: PartyInvite[] }> {
  return socialGet(
    `/social/parties/room/${encodeURIComponent(roomCode.toUpperCase())}/invites`,
    signal,
  );
}

export function sendPartyInvites(input: SendPartyInvitesInput): Promise<SendPartyInvitesResult> {
  return socialPost<SendPartyInvitesResult>("/social/parties/invites", {
    roomCode: input.roomCode,
    relayUrl: input.relayUrl,
    mediaTitle: input.mediaTitle,
    mediaId: input.mediaId,
    posterUrl: input.posterUrl,
    ttlMs: input.ttlMs,
    userIds: input.userIds,
  });
}

export function acceptPartyInvite(
  id: string,
): Promise<{ invite: PartyInvite; join: PartyJoinTarget }> {
  return socialPost(`/social/parties/invites/${encodeURIComponent(id)}/accept`);
}

export function declinePartyInvite(id: string): Promise<{ invite: PartyInvite }> {
  return socialPost(`/social/parties/invites/${encodeURIComponent(id)}/decline`);
}

export function revokePartyInvite(id: string): Promise<{ invite: PartyInvite }> {
  return socialDelete(`/social/parties/invites/${encodeURIComponent(id)}`);
}
