import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Heart, Loader2, MessageSquare, Search, Star, UserCheck, UserPlus, X } from "lucide-react";
import { ModalShell, useEscape, useModalExit } from "@/components/modal-shell";
import { useT } from "@/lib/i18n";
import {
  requestFriendship,
  resolveQuickFriendship,
  visibleQuickFriendship,
  friendRowLabel,
  type FriendRowState,
  type ProfileFriendStatus,
} from "@/lib/social/friend-request";
import { fetchFriends, fetchPendingRequests } from "@/lib/social/friends";
import { ReviewDiscussion } from "./review-comments";
import { useReviewActions } from "./use-review-actions";
import {
  fetchQuickReviews,
  pageQuickReviews,
  reviewFromRating,
  type QuickReview,
  type QuickSort,
} from "@/lib/social/quick-reviews";
import { UserHoverCard } from "@/views/profile/user-hover-card";
import { ProfileJoinedAt } from "@/views/profile/profile-joined-at";
import {
  profileCardStyle,
  profileBackgroundUrl,
  type ProfileCardLook,
} from "@/lib/social/profile-card-appearance";
import { socialGet } from "@/lib/social/client";
import { openDmConversation } from "@/lib/social/dm-store";
import { requestOpenDm } from "@/lib/social/dm-store";
import { requestOpenProfile } from "@/lib/social/open-profile";
import { profileMediaMeta } from "@/lib/social/profile-media-meta";
import { fetchUserRatings } from "@/lib/social/ratings-api";
import { currentAuthor } from "@/lib/theme-auth";
import { useView } from "@/lib/view";
import { Avatar, timeAgo } from "@/views/profile/profile-bits";
import { VerifiedBadge } from "@/views/account/verified-badge";
import { ReviewSortControls } from "./review-sort-controls";
import { WithReviewButton } from "./with-review-button";
import { MutualMatchBadge } from "./mutual-match-badge";
import { ReviewSpoiler } from "./review-spoiler";

// The review-rich profile quick menu, used from a title's User Reviews list only.
// It is deliberately not a global replacement for opening a profile: everywhere else
// a username still navigates, because that is what people expect there.

type QuickProfile = {
  handle: string;
  alias: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
  slogan?: string;
  description?: string;
  location?: string;
  level?: number;
  status?: string;
  online?: boolean;
  memberSince?: string;
  showJoinDate?: boolean;
  dmPolicy?: "everyone" | "friends";
  counts?: { watched?: number; friends?: number; badges?: number };
  profileCard?: ProfileCardLook;
  friendStatus?: ProfileFriendStatus;
};

type QuickResponse = {
  profile: QuickProfile | null;
  reviews: {
    items: QuickReview[];
    nextCursor?: string;
    total: number;
    sort: QuickSort;
  };
};

const PAGE = 12;

/**
 * The bundled `/quick` route is new. Until a deployment carries it, the menu falls back
 * to the two public routes production already serves: the profile row and the person's
 * rating history. The latch mirrors `user-search.ts`: probe once per session, then stop
 * paying for a 404 on every open. The new route stays the primary path when present.
 */
let quickRouteAvailable = true;

/**
 * The hub route sorts on the server. This ordering is the fallback's, and it must agree with the
 * route for every option, including the two counter-based ones: an author's ratings carry reaction
 * and comment counts, so popularity is real here rather than quietly replaced by recency.
 */
const PRESENCE_DOT: Record<string, string> = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  dnd: "bg-rose-500",
  offline: "bg-ink-subtle",
};

function ReviewerReviewRow({
  handle,
  review,
  onOpenTitle,
}: {
  review: QuickReview;
  handle: string;
  onOpenTitle: (review: QuickReview) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const {
    id,
    like,
    commentCount,
    liking,
    likeError,
    threadOpen,
    openingThread,
    toggleLike,
    toggleComments,
    onCommentCount,
  } = useReviewActions({
    handle,
    target: { itemKey: review.contentId, mediaType: review.contentType },
    reviewId: review.id,
    initialLike: { count: review.reactions.count, mine: review.reactions.viewerReacted },
    initialCommentCount: review.comments.count,
  });
  const liked = like.mine;
  const text = review.review ?? "";
  const hidden = review.spoiler === true && !revealed;
  const long = text.length > 260;

  return (
    <article className="rounded-xl bg-elevated/40 p-3 ring-1 ring-edge-soft">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => onOpenTitle(review)}
          aria-label={t("Open {title}", { title: review.title || review.contentId })}
          className="h-[96px] w-[64px] shrink-0 overflow-hidden rounded-md bg-canvas/70"
        >
          {review.posterUrl ? (
            <img
              src={review.posterUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              draggable={false}
            />
          ) : null}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenTitle(review)}
              className="min-w-0 flex-1 truncate text-start text-[14px] font-semibold text-ink transition-colors hover:text-accent"
            >
              {review.title || review.contentId}
            </button>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas/60 px-2 py-1 text-[12.5px] font-bold tabular-nums text-ink">
              <Star size={11} className="fill-current text-amber-400" />
              {review.score}/10
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[13px] text-ink-subtle">
            <span>{timeAgo(review.updatedAt || review.createdAt)}</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? t("Unlike this review") : t("Like this review")}
              disabled={liking}
              onClick={toggleLike}
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors ${liked ? "text-accent" : "text-ink-subtle hover:text-ink"}`}
            >
              <Heart size={14} className={liked ? "fill-current" : undefined} /> {like.count}
            </button>
            <button
              type="button"
              aria-expanded={threadOpen}
              aria-label={t("Comments")}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-ink-subtle transition-colors hover:text-ink"
              onClick={toggleComments}
              disabled={openingThread}
            >
              <MessageSquare size={14} /> {commentCount}
            </button>
            {likeError && (
              <span role="status">
                {likeError === "auth"
                  ? t("Sign in to like reviews.")
                  : t("Could not update this like.")}
              </span>
            )}
          </div>
          {text && (
            <div className="mt-2">
              <ReviewSpoiler hidden={hidden} onReveal={() => setRevealed(true)}>
                <p className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-ink-muted">
                  {long && !expanded ? `${text.slice(0, 260)}…` : text}
                </p>
              </ReviewSpoiler>
              {long && !hidden && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="ms-1 text-[11.5px] font-semibold text-ink"
                >
                  {expanded ? t("Less") : t("More")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {threadOpen && (
        <div className="mt-3 rounded-lg bg-canvas/50 px-3 pb-3 pt-1 ring-1 ring-edge-soft">
          <ReviewDiscussion reviewId={id} onCount={onCommentCount} />
        </div>
      )}
    </article>
  );
}

export function ReviewerQuickMenu({
  handle,
  fallback,
  excludeContentType,
  excludeContentId,
  onClose,
}: {
  handle: string;
  /** What the review row already knows, shown until the profile arrives. */
  fallback?: { alias?: string; avatarUrl?: string };
  /** The title whose review list opened this menu, excluded from the other ratings. */
  excludeContentType?: string;
  excludeContentId?: string;
  onClose: () => void;
}) {
  const t = useT();
  const { openMeta } = useView();
  const { closing, close } = useModalExit(onClose);
  useEscape(close);
  const me = currentAuthor();

  const [profile, setProfile] = useState<QuickProfile | null>(null);
  const [items, setItems] = useState<QuickReview[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<QuickSort>("recent");
  const [query, setQuery] = useState("");
  const [withReview, setWithReview] = useState(false);
  const [friend, setFriend] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [friendship, setFriendship] = useState<FriendRowState>("idle");
  // Until the relationship is known, treat the action as settled instead of offering a
  // duplicate request to someone who is already a friend or already asked.
  const [friendshipKnown, setFriendshipKnown] = useState(false);

  useEffect(() => {
    let alive = true;
    setFriendshipKnown(false);
    void Promise.allSettled([fetchFriends(), fetchPendingRequests()]).then(([frs, pend]) => {
      if (!alive) return;
      const relationship = resolveQuickFriendship(handle, profile?.friendStatus, {
        self: me?.handle ?? null,
        friends: frs.status === "fulfilled" ? frs.value.map((friend) => friend.handle) : undefined,
        pending:
          pend.status === "fulfilled"
            ? pend.value.map((request) => request.from.handle)
            : undefined,
      });
      setFriendship(relationship.state);
      setFriendshipKnown(relationship.known);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, profile?.friendStatus]);
  const [debounced, setDebounced] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [paging, setPaging] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fallbackRatings = useRef<QuickReview[] | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE));
    p.set("sort", sort);
    if (debounced) p.set("q", debounced);
    if (withReview) p.set("withReview", "1");
    if (excludeContentId) {
      p.set("excludeContentId", excludeContentId);
      if (excludeContentType) p.set("excludeContentType", excludeContentType);
    }
    return p.toString();
  }, [sort, debounced, withReview, excludeContentId, excludeContentType]);

  const loadFallback = useCallback(
    async (offset: number): Promise<QuickResponse> => {
      const profilePromise = socialGet<QuickProfile>(
        `/social/u/${encodeURIComponent(handle)}`,
      ).catch(() => null);
      if (!fallbackRatings.current) {
        const all: QuickReview[] = [];
        let ratingsCursor: string | undefined;
        // Five pages is 100 ratings: enough for a quick menu, bounded so opening a
        // prolific profile cannot walk an unlimited history.
        for (let page = 0; page < 5; page += 1) {
          const res = await fetchUserRatings(
            handle,
            ratingsCursor ? { cursor: ratingsCursor } : {},
          );
          for (const item of res.items ?? []) all.push(reviewFromRating(item));
          if (!res.nextCursor || res.nextCursor === ratingsCursor) break;
          ratingsCursor = res.nextCursor;
        }
        fallbackRatings.current = all;
      }
      const page = pageQuickReviews(fallbackRatings.current, {
        q: debounced,
        withReview,
        excludeContentId,
        excludeContentType,
        sort,
        offset,
        limit: PAGE,
      });
      return {
        profile: (await profilePromise) as QuickProfile | null,
        reviews: {
          items: page.items,
          nextCursor: page.nextOffset == null ? undefined : `off:${page.nextOffset}`,
          total: page.total,
          sort,
        },
      };
    },
    [handle, debounced, sort, withReview, excludeContentId, excludeContentType],
  );

  const load = useCallback(
    (nextCursor?: string) => {
      const ticket = ++requestId.current;
      if (nextCursor) setPaging(true);
      else setState("loading");
      const offset = nextCursor?.startsWith("off:") ? Number(nextCursor.slice(4)) || 0 : 0;
      const run = quickRouteAvailable
        ? fetchQuickReviews<QuickResponse>(handle, params, nextCursor).catch((error: unknown) => {
            const status = (error as { status?: number }).status;
            if (status !== 404 && status !== 405) throw error;
            quickRouteAvailable = false;
            return loadFallback(offset);
          })
        : loadFallback(offset);
      return run
        .then((data) => {
          if (ticket !== requestId.current) return;
          if (data.profile) setProfile(data.profile);
          setItems((cur) => (nextCursor ? [...cur, ...data.reviews.items] : data.reviews.items));
          setCursor(data.reviews.nextCursor);
          setTotal(data.reviews.total);
          setState("ready");
        })
        .catch(() => {
          if (ticket === requestId.current) setState("error");
        })
        .finally(() => {
          if (ticket === requestId.current) setPaging(false);
        });
    },
    [handle, params, loadFallback],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const openTitle = (review: QuickReview) => {
    close();
    openMeta(
      profileMediaMeta(review.contentId, review.contentType, {
        name: review.title || review.contentId,
        poster: review.posterUrl,
      }),
    );
  };

  const message = () => {
    if (!profile || messaging) return;
    setMessaging(true);
    setMessageError(null);
    // The quick payload carries the handle, not the id; a conversation needs the id,
    // so it is asked for through the same route the profile hero uses rather than
    // guessed from the handle.
    socialGet<{ id: string }>(`/social/u/${encodeURIComponent(profile.handle)}`)
      .then((row) => openDmConversation(row.id))
      .then((conversation) => {
        close();
        requestOpenDm(conversation.id);
      })
      .catch((err: unknown) => {
        setMessageError(
          err instanceof Error && /friend/i.test(err.message)
            ? t("This account only accepts messages from friends.")
            : t("A conversation could not be started."),
        );
      })
      .finally(() => setMessaging(false));
  };

  const mine = !!me && (me.handle || "").toLowerCase() === handle.toLowerCase();
  const profileHandle = profile?.handle || handle;
  const visibleFriendship = visibleQuickFriendship(friendship, friendshipKnown);
  const openFullProfile = () => {
    close();
    requestOpenProfile(profileHandle);
  };
  const friendLabel = t(friendRowLabel(friendship === "sending" ? "sending" : visibleFriendship));
  const friendSettled =
    visibleFriendship === "friends" ||
    visibleFriendship === "requested" ||
    visibleFriendship === "blocked";

  return (
    <ModalShell closing={closing} onDismiss={close} width={560} labelledBy="reviewer-quick-title">
      <div
        className="relative flex max-h-[min(84vh,760px)] flex-col overflow-hidden bg-elevated"
        style={profileCardStyle(profile?.profileCard)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className="relative h-24 w-full shrink-0 overflow-hidden"
            style={
              profileBackgroundUrl(profile ?? undefined)
                ? undefined
                : {
                    backgroundImage:
                      "radial-gradient(ellipse at top left, var(--color-accent-soft), transparent 75%)",
                  }
            }
          >
            {profile?.profileCard?.bgUrl || profile?.bannerUrl ? (
              <img
                src={profileBackgroundUrl(profile ?? undefined)}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : null}
            <button
              type="button"
              onClick={close}
              aria-label={t("Close")}
              className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-canvas/70 text-ink transition-colors hover:bg-canvas"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>

          <div className="relative shrink-0 px-4 pb-3">
            <div className="flex items-start gap-3 pt-1">
              <UserHoverCard handle={profileHandle}>
                <button
                  type="button"
                  onClick={openFullProfile}
                  aria-label={t("Open full profile")}
                  className="-mt-5 shrink-0 rounded-full transition-transform enabled:hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Avatar
                    src={profile?.avatarUrl ?? fallback?.avatarUrl}
                    size={64}
                    alias={profile?.alias || fallback?.alias || handle}
                  />
                </button>
              </UserHoverCard>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <UserHoverCard handle={profileHandle}>
                    <button
                      type="button"
                      onClick={openFullProfile}
                      className="min-w-0 truncate text-start text-[17.5px] font-semibold text-ink transition-colors hover:text-accent"
                    >
                      <span id="reviewer-quick-title" style={{ color: "var(--profile-card-name)" }}>
                        {profile?.alias || fallback?.alias || handle}
                      </span>
                    </button>
                  </UserHoverCard>
                  {profile?.verified && <VerifiedBadge size="sm" />}
                </div>
                <div className="flex items-center gap-1.5 text-[13px] text-ink-subtle">
                  <span
                    className={`h-2 w-2 rounded-full ${PRESENCE_DOT[profile?.status || "offline"] || PRESENCE_DOT.offline}`}
                  />
                  <span className="truncate" style={{ color: "var(--profile-card-handle)" }}>
                    @{profile?.handle || handle}
                  </span>
                  <MutualMatchBadge
                    handle={mine || visibleFriendship === "blocked" ? undefined : profileHandle}
                  />
                </div>
                <ProfileJoinedAt
                  value={profile?.memberSince}
                  show={profile?.showJoinDate !== false}
                  className="mt-1 block text-[11px] leading-relaxed text-ink-subtle"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pb-1">
                {!mine && (
                  <span className="inline-flex" title={friendSettled ? friendLabel : undefined}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!friendshipKnown || friendSettled) return;
                        setFriend("sending");
                        try {
                          const result = await requestFriendship(profile?.handle || handle);
                          setFriendship(result);
                          setFriend(result === "requested" ? "sent" : "idle");
                        } catch {
                          setFriend("error");
                        }
                      }}
                      disabled={
                        !friendshipKnown ||
                        friendSettled ||
                        friend === "sending" ||
                        friend === "sent"
                      }
                      aria-label={friendLabel}
                      title={friendLabel}
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${visibleFriendship === "friends" ? "cursor-default bg-elevated/60 text-accent" : !friendshipKnown ? "cursor-default bg-elevated/30 text-ink-subtle opacity-55" : friendSettled ? "cursor-default bg-elevated/60 text-ink-subtle" : "bg-elevated/60 text-ink-muted hover:text-ink"}`}
                    >
                      {friend === "sending" ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : visibleFriendship === "friends" ? (
                        <UserCheck size={14} strokeWidth={2.2} />
                      ) : (
                        <UserPlus size={14} strokeWidth={2.2} />
                      )}
                    </button>
                  </span>
                )}
                {!mine && (
                  <button
                    type="button"
                    onClick={message}
                    disabled={messaging}
                    className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-[12px] font-semibold text-canvas transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
                  >
                    {messaging ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <MessageSquare size={13} />
                    )}
                    {t("Message")}
                  </button>
                )}
              </div>
            </div>
            {profile?.slogan && (
              <p
                style={{ color: "var(--profile-card-bio)" }}
                className="mt-2 line-clamp-1 text-[12.5px] text-ink-muted"
              >
                {profile.slogan}
              </p>
            )}
            {messageError && <p className="mt-1 text-[11.5px] text-ink-muted">{messageError}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2 px-4">
            <div className="relative flex-1">
              <Search
                size={14}
                strokeWidth={2.2}
                className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search their ratings")}
                className="h-8 w-full rounded-full bg-elevated/60 ps-8 pe-3 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:ring-1 focus:ring-inset focus:ring-accent/40"
              />
            </div>
            <WithReviewButton pressed={withReview} onToggle={() => setWithReview((v) => !v)} />
          </div>

          <div className="mt-3 shrink-0 px-4">
            <ReviewSortControls value={sort} onChange={setSort} compact />
          </div>

          <div className="mt-2 flex-1 overflow-y-auto px-4 pb-4">
            <div className="mb-2 flex items-center justify-between text-[11.5px] uppercase tracking-wider text-ink-subtle">
              <span>{t("Other ratings")}</span>
              {state === "ready" && <span className="tabular-nums">{total}</span>}
            </div>

            {state === "loading" && (
              <div className="flex items-center justify-center py-10 text-ink-subtle">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
            {state === "error" && (
              <button
                type="button"
                onClick={() => void load()}
                className="w-full rounded-lg bg-elevated/50 py-3 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
              >
                {t("Reviews could not be loaded. Retry")}
              </button>
            )}
            {state === "ready" && !items.length && (
              <p className="py-8 text-center text-[12.5px] text-ink-muted">
                {debounced ? t("No ratings match your search") : t("No other ratings yet.")}
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {items.map((review) => (
                <ReviewerReviewRow
                  key={JSON.stringify([
                    profileHandle,
                    review.contentType,
                    review.contentId,
                    review.updatedAt,
                    review.spoiler,
                  ])}
                  review={review}
                  onOpenTitle={openTitle}
                  handle={profileHandle}
                />
              ))}
            </div>
            {state === "ready" && cursor && (
              <button
                type="button"
                onClick={() => void load(cursor)}
                disabled={paging}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-elevated/50 text-[12.5px] font-medium text-ink-muted transition-colors enabled:hover:text-ink"
              >
                {paging && <Loader2 size={13} className="animate-spin" />}
                {t("Load more")}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
