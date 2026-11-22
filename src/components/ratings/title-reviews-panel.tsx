import { useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, X } from "lucide-react";
import { ModalShell, useModalExit } from "@/components/modal-shell";
import { useT } from "@/lib/i18n";
import { authToken } from "@/lib/theme-auth";
import type { RatingTarget } from "@/lib/ratings/types";
import { loadTitleReviewsWithMatches, type TitleRatingsSnapshot } from "@/lib/social/title-reviews";
import { ReviewerQuickMenu } from "./reviewer-quick-menu";
import {
  foldHandle,
  sortTitleRatings,
  type RatingSort,
  type TitleRef,
} from "@/lib/social/review-rank";
import { ReviewCard } from "./review-card";
import { ReviewSortControls } from "./review-sort-controls";
import { WithReviewButton } from "./with-review-button";

type Scope = "friends" | "everyone";

function useTitleRatings(target: TitleRef, scope: Scope) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [snapshot, setSnapshot] = useState<TitleRatingsSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState("loading");
    loadTitleReviewsWithMatches(target, scope)
      .then((next) => {
        if (!live) return;
        setSnapshot(next);
        setState("ready");
      })
      .catch(() => {
        if (live) setState("error");
      });
    return () => {
      live = false;
    };
  }, [scope, target, attempt]);

  return { state, snapshot, retry: () => setAttempt((n) => n + 1) };
}

function Tab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${
        active ? "bg-ink text-canvas shadow-sm" : "text-ink-muted hover:bg-elevated hover:text-ink"
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "text-canvas/65" : "text-ink-subtle"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function TitleReviewsPanel({
  target,
  onClose,
}: {
  target: RatingTarget;
  onClose: () => void;
}) {
  const t = useT();
  const signedIn = !!authToken();
  const { closing, close } = useModalExit(onClose);
  const [tab, setTab] = useState<Scope>(signedIn ? "friends" : "everyone");
  const [sort, setSort] = useState<RatingSort>("recent");
  const [withReview, setWithReview] = useState(false);
  // Only this panel opens the review-rich quick menu. Everywhere else a username still
  // navigates to the full profile, which is what people expect on a profile page.
  const [quickHandle, setQuickHandle] = useState<string | null>(null);
  const [quickSeed, setQuickSeed] = useState<{ alias?: string; avatarUrl?: string }>({});

  const ref = useMemo<TitleRef>(
    () => ({ itemKey: target.itemKey, mediaType: target.mediaType }),
    [target.itemKey, target.mediaType],
  );

  const friends = useTitleRatings(ref, "friends");
  const everyone = useTitleRatings(ref, "everyone");
  const knownFriends = useMemo(
    () => new Set((friends.snapshot?.ratings ?? []).map((rating) => foldHandle(rating.handle))),
    [friends.snapshot],
  );
  const active = tab === "friends" ? friends : everyone;
  const snapshot = active.snapshot;

  const reviews = useMemo(() => {
    const list = (snapshot?.ratings ?? []).filter(
      (review) => !withReview || !!review.review?.trim(),
    );
    return sortTitleRatings(list, sort);
  }, [snapshot, sort, withReview]);

  const average = useMemo(() => {
    const ratings = snapshot?.ratings ?? [];
    if (!ratings.length) return null;
    const sum = ratings.reduce((total, review) => total + review.score, 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }, [snapshot]);

  const title =
    tab === "friends"
      ? reviews.length === 1
        ? t("1 friend rated this")
        : t("{count} friends rated this", { count: reviews.length })
      : reviews.length === 1
        ? t("1 rating")
        : t("{count} ratings", { count: reviews.length });

  return (
    <ModalShell closing={closing} onDismiss={close} width={620} labelledBy="title-reviews-title">
      <div className="relative shrink-0 overflow-hidden border-b border-edge-soft">
        {target.poster && (
          <img
            src={target.poster}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-y-0 end-0 h-full w-56 object-cover opacity-25 blur-[1px]"
            style={{ maskImage: "linear-gradient(to left, black, transparent)" }}
            draggable={false}
          />
        )}
        <div className="relative flex items-start gap-3 p-4">
          {target.poster && (
            <img
              src={target.poster}
              alt=""
              className="h-[72px] w-12 shrink-0 rounded-lg object-cover ring-1 ring-edge-soft shadow-[0_8px_20px_-10px_rgba(0,0,0,0.7)]"
              draggable={false}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
              {t("Social reviews")}
            </p>
            <h2
              id="title-reviews-title"
              className="mt-0.5 truncate text-[17px] font-semibold text-ink"
            >
              {target.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-subtle">
              <span>{title}</span>
              {average !== null && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-semibold text-ink-muted">
                    {tab === "friends"
                      ? t("Friends average score")
                      : t("Harbor users average score")}
                    {" · "}
                    {average}/10
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("Close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-edge-soft px-4 py-2">
        <div role="tablist" aria-label={t("Review scope")} className="flex items-center gap-0.5">
          <Tab
            active={tab === "friends"}
            onClick={() => setTab("friends")}
            count={friends.snapshot?.ratings.length}
          >
            {t("Friends")}
          </Tab>
          <Tab
            active={tab === "everyone"}
            onClick={() => setTab("everyone")}
            count={everyone.snapshot?.ratings.length}
          >
            {t("Everyone")}
          </Tab>
        </div>
      </div>
      <div className="border-b border-edge-soft px-4 py-2">
        <ReviewSortControls value={sort} onChange={setSort} compact />
      </div>
      <div className="flex border-b border-edge-soft px-4 py-2">
        <WithReviewButton pressed={withReview} onToggle={() => setWithReview((v) => !v)} />
      </div>

      <div className="harbor-scroll min-h-[220px] flex-1 overflow-y-auto p-4">
        {(active.state === "loading" || active.state === "idle") && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl bg-elevated/30 p-3.5 ring-1 ring-edge-soft">
                <div className="flex gap-3">
                  <div className="h-[38px] w-[38px] shrink-0 animate-pulse rounded-full bg-elevated" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-elevated" />
                    <div className="h-3 w-24 animate-pulse rounded bg-elevated" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-elevated" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-elevated" />
                </div>
              </div>
            ))}
            <p className="py-1 text-center text-[12px] text-ink-subtle">
              {signedIn ? t("Loading reviews and match scores…") : t("Loading reviews…")}
            </p>
          </div>
        )}

        {active.state === "error" && (
          <div className="py-10 text-center">
            <p className="text-[13px] text-ink-subtle">{t("Could not load reviews")}</p>
            <button
              type="button"
              onClick={() => active.retry()}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-elevated px-4 text-[13px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
            >
              <RefreshCw size={13} />
              {t("Try again")}
            </button>
          </div>
        )}

        {active.state === "ready" && snapshot?.matchesIncomplete && (
          <p className="mb-3 text-[12px] text-ink-subtle">
            {t("Some match scores could not be loaded.")}
          </p>
        )}

        {active.state === "ready" && reviews.length === 0 && (
          <div className="px-2 py-10 text-center">
            <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-elevated text-ink-subtle">
              <MessageSquare size={18} />
            </span>
            <p className="text-[13px] text-ink-muted">
              {tab === "friends"
                ? signedIn
                  ? t("None of your friends have rated this yet.")
                  : t("Sign in to see what your friends think.")
                : t("No one here has rated this yet.")}
            </p>
            {tab === "friends" && (
              <button
                type="button"
                onClick={() => setTab("everyone")}
                className="mt-3 inline-flex h-9 items-center rounded-full bg-elevated px-4 text-[13px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
              >
                {t("Browse everyone")}
              </button>
            )}
          </div>
        )}

        {active.state === "ready" && reviews.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {reviews.map((review) => (
              <ReviewCard
                key={`${review.handle}-${review.at}`}
                review={review}
                target={ref}
                isFriend={tab === "friends" || knownFriends.has(foldHandle(review.handle))}
                onOpenAuthor={() => {
                  setQuickSeed({ alias: review.alias, avatarUrl: review.avatarUrl });
                  setQuickHandle(review.handle);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {quickHandle && (
        <ReviewerQuickMenu
          handle={quickHandle}
          fallback={quickSeed}
          excludeContentType={target.mediaType}
          excludeContentId={target.itemKey}
          onClose={() => setQuickHandle(null)}
        />
      )}
    </ModalShell>
  );
}
