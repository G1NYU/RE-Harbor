import {
  Activity,
  Check,
  ImagePlus,
  Loader2,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Settings2,
  Share2,
  UserMinus,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { ConfirmableAction } from "@/components/context-menu/action-items";
import { ShareModal } from "./share-modal";
import { ProfileJoinedAt } from "./profile-joined-at";
import { profileBackgroundUrl } from "@/lib/social/profile-card-appearance";
import { countryFlagSrc } from "@/components/flag";
import { acceptFriend, removeFriend, sendFriendRequest } from "@/lib/social/friends";
import { type DmError } from "@/lib/social/dm";
import { socialGet } from "@/lib/social/client";
import { openDmConversation } from "@/lib/social/dm-store";
import { requestOpenDm, useDmState } from "@/lib/social/dm-store";
import { PRESENCE_META, useMyPresence } from "@/lib/social/presence";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { useContextMenu } from "@/lib/context-menu";
import {
  userContextTarget,
  friendContextActions,
  publishFriendStatus,
  subscribeFriendStatus,
} from "./context-targets";
import {
  sanitizeStatLayout,
  STAT_ORDER,
  watchMinutes,
  type StatKey,
} from "@/lib/profile-card-layout";
import { countryName } from "./flags";
import { saveSlogan } from "./profile-api";
import { orderShownBadges } from "./badge-catalog";
import { EditProfileHint } from "./edit-profile-hint";
import {
  Avatar,
  compactNumber,
  FeaturedBadge,
  formatWatchTime,
  StatPill,
  VerifiedCheck,
} from "./profile-bits";
import { StatusBubble } from "./status-bubble";
import type { ProfileSummary } from "./profile-types";
import { HARBOR_API_BASE } from "@/lib/config/endpoints";

type HeroBadge = { id: string; name: string; iconUrl?: string };

const STAT_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-3 sm:grid-cols-5",
  6: "grid-cols-3 sm:grid-cols-6",
};

export function ProfileHero({
  p,
  avatar,
  avatarFallback,
  mangaReadOverride,
  badges,
  userFont,
  hideBanner,
  signedIn = false,
  onEdit,
  onPatch,
}: {
  p: ProfileSummary;
  avatar?: string;
  avatarFallback?: string;
  mangaReadOverride?: number;
  badges?: HeroBadge[];
  userFont?: string;
  hideBanner?: boolean;
  signedIn?: boolean;
  onEdit?: () => void;
  onPatch?: (next: ProfileSummary) => void;
}) {
  const t = useT();
  const backgroundUrl = profileBackgroundUrl(p);
  const { openFeed } = useView();
  const { open: openContext } = useContextMenu();
  const [relationship, setRelationship] = useState(p.friendStatus);
  useEffect(() => setRelationship(p.friendStatus), [p.handle, p.friendStatus]);
  useEffect(
    () =>
      subscribeFriendStatus((handle, status) => {
        if (handle.toLowerCase() === p.handle.toLowerCase()) setRelationship(status);
      }),
    [p.handle],
  );
  const openUserContext = (event: React.MouseEvent) =>
    openContext(event, userContextTarget(p.handle, friendContextActions(p.handle, relationship)));
  const nameFont = userFont ? { fontFamily: `"${userFont}", var(--font-display)` } : undefined;
  const nameBadges = orderShownBadges(badges ?? [], p.shownBadges)
    .filter((b) => b.iconUrl)
    .slice(0, 6);
  const [sharing, setSharing] = useState(false);
  const shareUrl = `${HARBOR_API_BASE}/u/${p.customUrl || p.handle}`;
  const myStatus = useMyPresence();
  const meta = PRESENCE_META[myStatus];
  const dotClass = p.isOwner ? meta.dot : p.online ? "bg-success" : "bg-ink-subtle";
  const presenceLabel = p.isOwner
    ? myStatus === "online"
      ? t("Online now")
      : myStatus === "away"
        ? t("Away")
        : myStatus === "dnd"
          ? t("Do not disturb")
          : t("Appear offline")
    : p.online
      ? t("Online now")
      : t("Offline");
  const presenceText = p.isOwner ? meta.text : p.online ? "text-success" : "";
  const hiddenStats = new Set(sanitizeStatLayout(p.statLayout).hidden);
  const showStat = (k: StatKey) => !hiddenStats.has(k);
  const shownCount = STAT_ORDER.filter(showStat).length;
  const statCols = STAT_GRID[shownCount] || "grid-cols-3 sm:grid-cols-6";
  return (
    <header className="relative w-full overflow-hidden">
      <div className="relative h-48 w-full sm:h-60">
        {!hideBanner &&
          (backgroundUrl ? (
            <img
              src={backgroundUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-elevated), var(--color-surface) 55%, var(--color-canvas))",
              }}
            />
          ))}
        {!hideBanner && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: "linear-gradient(to bottom, transparent 28%, var(--color-canvas))",
            }}
          />
        )}
        {p.isOwner && !backgroundUrl && !hideBanner && onEdit && (
          <button
            onClick={onEdit}
            className="absolute end-4 top-24 inline-flex items-center gap-1.5 rounded-full bg-elevated/70 px-3 py-1.5 text-[12px] font-medium text-ink ring-1 ring-edge-soft backdrop-blur transition-colors hover:bg-elevated"
          >
            <ImagePlus size={14} /> {t("Add background")}
          </button>
        )}
      </div>

      <div className="relative mx-auto -mt-20 w-full max-w-6xl px-6 pb-6 lg:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6">
          <div
            onContextMenu={openUserContext}
            tabIndex={0}
            className="relative flex h-[124px] w-[124px] shrink-0"
          >
            <Avatar
              src={avatar}
              fallbackSrc={avatarFallback}
              size={124}
              dotClass={dotClass}
              alias={p.alias}
            />
            <StatusBubble
              slogan={p.slogan}
              isOwner={p.isOwner}
              onSave={async (next) => {
                const s = await saveSlogan(next);
                onPatch?.(s);
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                onContextMenu={openUserContext}
                tabIndex={0}
                className="font-display text-[30px] leading-tight text-ink"
                style={nameFont}
              >
                {p.alias}
              </h1>
              {p.verified && <VerifiedCheck size={22} />}
              {nameBadges.map((b) => (
                <HeroBadge key={b.id} badge={b} />
              ))}
              {p.featured && <FeaturedBadge />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-subtle">
              <span onContextMenu={openUserContext} className="text-ink-muted">
                @{p.handle}
              </span>
              {p.pronouns && <span>{p.pronouns}</span>}
              <span className={presenceText}>{presenceLabel}</span>
              {p.location && (
                <span className="inline-flex items-center gap-1.5">
                  {countryFlagSrc(p.location) ? (
                    <img
                      src={countryFlagSrc(p.location) ?? ""}
                      alt=""
                      draggable={false}
                      className="shrink-0"
                      style={{ height: 12, width: 18, borderRadius: 2, objectFit: "cover" }}
                    />
                  ) : (
                    <MapPin size={13} />
                  )}
                  {countryName(p.location)}
                </span>
              )}
              <ProfileJoinedAt
                value={p.memberSince}
                show={p.showJoinDate !== false}
                className="basis-full text-[11.5px] text-ink-subtle"
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {p.isOwner && onEdit ? (
              <>
                <button
                  onClick={openFeed}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 text-[14px] font-medium text-ink ring-1 ring-edge transition-colors hover:bg-raised"
                >
                  <Activity size={18} /> {t("Activity")}
                </button>
                <button
                  onClick={() => setSharing(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 text-[14px] font-medium text-ink ring-1 ring-edge transition-colors hover:bg-raised"
                >
                  <Share2 size={18} /> {t("Share")}
                </button>
                <EditProfileHint enabled={p.isOwner}>
                  <button
                    onClick={onEdit}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-surface px-4 text-[14px] font-medium text-ink ring-1 ring-edge transition-colors hover:bg-raised"
                  >
                    <Settings2 size={18} /> {t("Edit profile")}
                  </button>
                </EditProfileHint>
              </>
            ) : (
              !p.isOwner && (
                <>
                  <MessageButton p={p} signedIn={signedIn} />
                  <FriendButton
                    handle={p.handle}
                    initial={p.friendStatus ?? "none"}
                    edgeId={p.friendEdgeId}
                  />
                </>
              )
            )}
          </div>
        </div>
        {sharing && (
          <ShareModal
            target={{
              heading: t("Share profile"),
              linkLabel: t("Profile link"),
              url: shareUrl,
              cardUrl: `${shareUrl}/card.png`,
              text: t("{name} on Harbor", { name: p.alias }),
              name: p.alias,
            }}
            onClose={() => setSharing(false)}
          />
        )}

        <div className={`mt-5 grid gap-2 sm:gap-3 ${statCols}`}>
          {showStat("watchTime") && <WatchTimePill totalMinutes={watchMinutes(p.counts)} />}
          {showStat("episodes") && (
            <StatPill value={compactNumber(p.counts.episodesWatched ?? 0)} label={t("Episodes")} />
          )}
          {showStat("movies") && (
            <StatPill value={compactNumber(p.counts.moviesWatched ?? 0)} label={t("Movies")} />
          )}
          {showStat("read") && (
            <StatPill
              value={compactNumber(
                mangaReadOverride ?? (p.counts as { mangaRead?: number }).mangaRead ?? 0,
              )}
              label={t("Read")}
            />
          )}
          {showStat("friends") && (
            <StatPill value={compactNumber(p.counts.friends)} label={t("Friends")} />
          )}
          {showStat("badges") && (
            <StatPill value={compactNumber(p.counts.badges)} label={t("Badges")} />
          )}
        </div>
      </div>
    </header>
  );
}

function HeroBadge({ badge }: { badge: HeroBadge }) {
  return (
    <span className="group/badge relative inline-flex">
      <img
        src={badge.iconUrl}
        width={22}
        height={22}
        alt={badge.name}
        draggable={false}
        className="inline-block"
      />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-elevated px-2 py-1 text-[11px] font-medium text-ink opacity-0 shadow-lg ring-1 ring-edge-soft transition-opacity duration-150 group-hover/badge:opacity-100">
        {badge.name}
      </span>
    </span>
  );
}

function WatchTimePill({ totalMinutes }: { totalMinutes: number }) {
  const t = useT();
  const { a, aVal, b, bVal, c, cVal } = formatWatchTime(totalMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="flex flex-col items-center rounded-md bg-surface px-2 py-2.5 ring-1 ring-edge-soft">
      <span className="flex items-baseline tabular-nums">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {a}
        </span>
        <span className="ms-1 text-[17px] font-semibold text-ink">{pad(aVal)}</span>
        <span className="ms-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {b}
        </span>
        <span className="ms-1 text-[17px] font-semibold text-ink">{pad(bVal)}</span>
        <span className="ms-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {c}
        </span>
        <span className="ms-1 text-[17px] font-semibold text-ink">{pad(cVal)}</span>
      </span>
      <span className="text-[11px] uppercase tracking-[0.1em] text-ink-subtle">
        {t("Watch Time")}
      </span>
    </div>
  );
}

type FriendRel = NonNullable<ProfileSummary["friendStatus"]>;

function MessageButton({ p, signedIn }: { p: ProfileSummary; signedIn: boolean }) {
  const t = useT();
  const dm = useDmState();
  const noteId = useId();
  const [busy, setBusy] = useState(false);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [blockedNow, setBlockedNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An existing thread outlives a policy change, so it always wins over the
  // friends-only gate. Match by id when the API provides one, then by handle.
  const existing = useMemo(() => {
    const handle = p.handle.toLowerCase();
    return dm.conversations.find(
      (c) => (p.id && c.other?.id === p.id) || c.other?.handle?.toLowerCase() === handle,
    );
  }, [dm.conversations, p.id, p.handle]);

  if (!signedIn || p.isOwner) return null;

  const blocked = blockedNow || p.friendStatus === "blocked";
  // Private profiles return before relationship resolution, so only gate on the
  // policy when we actually know the friendship state. The server still enforces
  // it on open.
  const policyBlocked =
    p.dmPolicy === "friends" &&
    p.friendStatus !== undefined &&
    p.friendStatus !== "friends" &&
    !existing;
  const restricted = blocked || friendsOnly || policyBlocked;
  const reason = blocked
    ? t("You cannot message this person.")
    : policyBlocked || friendsOnly
      ? t("{name} only accepts direct messages from friends.", { name: p.alias })
      : "";
  const note = error || reason;

  const start = async () => {
    if (busy || restricted) return;
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        requestOpenDm(existing.id);
        return;
      }
      let id = p.id;
      if (!id) {
        id = (await socialGet<{ id: string }>(`/social/u/${encodeURIComponent(p.handle)}`)).id;
      }
      if (!id) throw new Error(t("This person could not be found."));
      const conversation = await openDmConversation(id);
      requestOpenDm(conversation.id);
    } catch (err) {
      const e = err as DmError;
      if (e.code === "dm_friends_only") setFriendsOnly(true);
      else if (e.code === "blocked") setBlockedNow(true);
      else setError(e instanceof Error ? e.message : t("The conversation could not be opened."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`group/msg relative ${restricted ? "cursor-not-allowed" : ""}`}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy || restricted}
        aria-disabled={busy || restricted}
        aria-busy={busy}
        aria-describedby={note ? noteId : undefined}
        title={restricted ? reason : undefined}
        className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-[14px] font-semibold transition-colors ${
          restricted
            ? "pointer-events-none cursor-not-allowed bg-surface/50 text-ink-subtle opacity-60 ring-1 ring-edge-soft"
            : "bg-surface text-ink ring-1 ring-edge hover:bg-raised"
        }`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : restricted ? (
          <LockKeyhole size={17} />
        ) : (
          <MessageCircle size={18} />
        )}
        {busy ? t("Opening...") : t("Message")}
      </button>
      {note && (
        <span
          id={noteId}
          role={error ? "status" : "tooltip"}
          className={`pointer-events-none absolute bottom-full end-0 z-30 mb-2 w-60 rounded-lg bg-elevated px-3 py-2 text-[11.5px] font-medium leading-snug shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)] ring-1 ring-edge-soft transition-opacity duration-150 ${
            error
              ? "text-danger opacity-100"
              : "text-ink-muted opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
          }`}
        >
          {note}
        </span>
      )}
    </div>
  );
}

const FRIEND_BTN =
  "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-[14px] font-semibold transition-colors disabled:opacity-70";

function FriendButton({
  handle,
  initial,
  edgeId,
}: {
  handle: string;
  initial: FriendRel;
  edgeId?: string;
}) {
  const t = useT();
  const [rel, setRel] = useState<FriendRel>(initial);
  useEffect(() => setRel(initial), [handle, initial]);
  useEffect(
    () =>
      subscribeFriendStatus((changed, status) => {
        if (changed.toLowerCase() === handle.toLowerCase()) setRel(status);
      }),
    [handle],
  );
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState(false);

  const act = async (fn: () => Promise<unknown>, next: FriendRel) => {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await fn();
      setRel(next);
      publishFriendStatus(handle, next);
      setHover(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  if (rel === "blocked") return null;

  if (rel === "friends") {
    return (
      <ConfirmableAction
        source={{ actions: () => friendContextActions(handle, rel) }}
        actionId="friend:remove"
        className={`${FRIEND_BTN} bg-surface text-ink ring-1 ring-edge hover:bg-danger/12 hover:text-danger`}
      >
        <UserCheck size={18} strokeWidth={2.2} /> {t("Friends")}
      </ConfirmableAction>
    );
  }

  if (rel === "incoming") {
    return (
      <button
        onClick={() => (edgeId ? act(() => acceptFriend(edgeId), "friends") : undefined)}
        disabled={busy || !edgeId}
        className={`${FRIEND_BTN} bg-ink text-canvas hover:opacity-90`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Check size={18} strokeWidth={2.6} />
        )}
        {busy ? t("Accepting...") : t("Accept request")}
      </button>
    );
  }

  if (rel === "outgoing") {
    return (
      <button
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => act(() => removeFriend(handle), "none")}
        disabled={busy}
        className={`${FRIEND_BTN} ${hover ? "bg-danger/12 text-danger ring-1 ring-danger/30" : "bg-surface text-ink-muted ring-1 ring-edge"}`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : hover ? (
          <UserMinus size={18} />
        ) : (
          <Check size={18} strokeWidth={2.6} />
        )}
        {busy ? t("Canceling...") : hover ? t("Cancel request") : t("Requested")}
      </button>
    );
  }

  return (
    <button
      onClick={() => act(() => sendFriendRequest(handle), "outgoing")}
      disabled={busy}
      className={`${FRIEND_BTN} ${error ? "bg-surface text-ink ring-1 ring-edge" : "bg-ink text-canvas hover:opacity-90"}`}
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
      {busy ? t("Sending...") : error ? t("Try again") : t("Add friend")}
    </button>
  );
}
