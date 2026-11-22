import { useEffect, useRef, useState } from "react";
import { Loader2, Palette, Star, UserCheck, UserPlus, UserX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { sendFriendRequest, removeFriend, acceptFriend } from "@/lib/social/friends";
import { captureSessionScope, currentAuthor } from "@/lib/theme-auth";
import { publishFriendStatus, subscribeFriendStatus } from "@/views/profile/context-targets";
import { ProfileCardPanel } from "@/views/profile/profile-card-panel";
import { useProfileCardSummary } from "@/lib/social/profile-card-summary";
import type { FriendStatus } from "@/lib/social/friend-command";
import { MutualMatchLabel } from "@/components/ratings/mutual-match-badge";
import type { DiscoveredUser } from "@/lib/social/user-discovery";

export function DiscoveryUserCard({
  user,
  friend,
  signedIn,
  onOpen,
}: {
  user: DiscoveredUser;
  friend: boolean;
  signedIn: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const cardRef = useRef<HTMLElement>(null);
  const { summary, failed } = useProfileCardSummary(user.handle, cardRef);
  const [relationship, setRelationship] = useState<FriendStatus>(
    friend ? "friends" : (user.friendStatus ?? "none"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRelationship(summary?.friendStatus ?? (friend ? "friends" : (user.friendStatus ?? "none")));
  }, [summary?.friendStatus, friend, user.friendStatus]);
  useEffect(
    () =>
      subscribeFriendStatus((handle, status) => {
        if (handle.toLowerCase() === user.handle.toLowerCase()) setRelationship(status);
      }),
    [user.handle],
  );
  const act = async () => {
    if (busy || !signedIn || relationship === "friends" || relationship === "blocked") return;
    const isCurrent = captureSessionScope();
    setBusy(true);
    setError(null);
    try {
      let next: FriendStatus;
      if (relationship === "outgoing") {
        const result = await removeFriend(user.handle);
        if (!result.ok) throw new Error(t("Could not cancel request."));
        next = "none";
      } else if (relationship === "incoming") {
        const edgeId = summary?.friendEdgeId ?? user.friendEdgeId;
        if (!edgeId) throw new Error(t("Open the profile to accept this request."));
        await acceptFriend(edgeId);
        next = "friends";
      } else {
        const { edge } = await sendFriendRequest(user.handle);
        next =
          edge.status === "accepted"
            ? "friends"
            : edge.requesterId && edge.requesterId !== currentAuthor()?.id
              ? "incoming"
              : "outgoing";
      }
      if (!isCurrent()) return;
      setRelationship(next);
      publishFriendStatus(user.handle, next);
    } catch (reason) {
      if (isCurrent())
        setError(reason instanceof Error ? reason.message : t("Could not update friendship."));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <article ref={cardRef} className="min-w-0">
      <ProfileCardPanel
        profile={
          summary ?? {
            handle: user.handle,
            alias: user.displayName,
            avatarUrl: user.avatarUrl,
            verified: user.verified,
            memberSince: user.memberSince,
            showJoinDate: user.showJoinDate,
          }
        }
        onOpen={onOpen}
        loading={!summary && !failed}
        failed={failed && !summary}
        className="h-full shadow-sm"
        footer={
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Star size={13} />
                {t("{count} ratings", { count: user.ratingCount })}
              </span>
              <button
                type="button"
                onClick={() => void act()}
                disabled={
                  !signedIn || busy || relationship === "friends" || relationship === "blocked"
                }
                title={
                  !signedIn
                    ? t("Sign in to add friends")
                    : relationship === "outgoing"
                      ? t("Cancel request")
                      : undefined
                }
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors disabled:cursor-default ${relationship === "friends" ? "bg-success/10 text-success" : relationship === "outgoing" ? "bg-elevated text-ink-muted" : "bg-elevated text-ink hover:bg-raised"}`}
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : relationship === "friends" ? (
                  <UserCheck size={14} />
                ) : relationship === "outgoing" ? (
                  <UserX size={14} />
                ) : (
                  <UserPlus size={14} />
                )}
                {relationship === "friends"
                  ? t("Friends")
                  : relationship === "outgoing"
                    ? t("Requested")
                    : busy
                      ? t("Sending...")
                      : relationship === "incoming"
                        ? t("Accept request")
                        : t("Add")}
              </button>
            </div>
            {user.match?.score != null && (
              <div className="mt-2">
                <MutualMatchLabel match={user.match} />
              </div>
            )}
            {user.hasCanvas && (
              <span
                title={t(
                  "Profiles with a custom HTML/CSS layout enabled or saved. Choosing a theme alone does not count.",
                )}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-subtle"
              >
                <Palette size={13} />
                {t("Custom profile")}
              </span>
            )}
            {error && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {error}
              </p>
            )}
          </>
        }
      />
    </article>
  );
}
