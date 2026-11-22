import { useT } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { inferRatingMediaType } from "@/lib/ratings/types";
import { ensureMarksForTitle, useTitleHoverSummary } from "@/lib/social/friend-review-index";
import { UnratedReviewIcon } from "@/components/icons/unrated-review-icon";
import { HoverTooltip } from "@/components/hover-tooltip";
import { Avatar } from "@/views/profile/profile-bits";
import { HarborMark } from "@/components/icons/harbor-mark";
import type { FriendReviewMark } from "@/lib/social/friend-review-index";

/** The same media-type inference used when a title is rated. */
function contentTypeFor(metaId: string, kind?: string): string {
  return inferRatingMediaType(metaId, {
    type: kind,
    isAnime: /^(kitsu|mal|anilist|anidb):/i.test(metaId),
  });
}

/**
 * How many avatars to draw and how many to count as "+N". The backend sends an uncapped friend
 * count but only a few avatars, so the remainder has to be arithmetic — and it must never go
 * negative when a cached scan holds fewer marks than the count claims.
 */
export function friendBadgePlan(
  marks: FriendReviewMark[],
  max = 3,
): { shown: FriendReviewMark[]; extra: number; total: number } {
  const shown = marks.slice(0, max);
  const total = Math.max(marks[0]?.totalCount ?? marks.length, marks.length);
  return { shown, extra: Math.max(0, total - shown.length), total };
}

export function FriendReviewBadges({
  metaId,
  kind,
  className = "absolute bottom-1.5 start-1.5",
  avatarSize = 18,
}: {
  metaId: string;
  kind?: string;
  className?: string;
  avatarSize?: number;
}) {
  const t = useT();
  const contentType = contentTypeFor(metaId, kind);
  const summary = useTitleHoverSummary(contentType, metaId);
  const averageScore = summary?.averageScore ?? null;
  const badgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      const element = badgeRef.current;
      if (
        element?.checkVisibility &&
        !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
        return;
      void ensureMarksForTitle(contentTypeFor(metaId, kind), metaId);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [metaId, kind]);
  const friends = summary?.friends ?? [];
  const marks = friends.length > 0 ? friends : (summary?.community ?? []);
  if (marks.length === 0 && averageScore === null && !summary) return null;

  const { shown, extra, total: totalCount } = friendBadgePlan(marks);
  const label =
    friends.length > 0
      ? totalCount === 1
        ? t("1 friend rated this")
        : t("{count} friends rated this", { count: totalCount })
      : t("Recently rated by Harbor users");

  if (marks.length === 0 && averageScore === null) {
    return (
      <HoverTooltip
        label=""
        details={
          <div className="text-center">
            <HarborMark className="mx-auto mb-2 h-5 w-5 text-[#eba018]" />
            <span className="block font-normal text-ink-muted">
              {t("No available ratings yet.")}
            </span>
          </div>
        }
        side="top"
        align="end"
        className={`pointer-events-auto z-10 ${className}`}
      >
        <span
          ref={badgeRef}
          role="img"
          aria-label={t("No available ratings yet.")}
          className="inline-flex shrink-0 items-center gap-0.5 text-ink-muted transition-colors hover:text-ink"
        >
          <span
            className="inline-flex shrink-0 items-center justify-center text-ink-muted"
            style={{ width: avatarSize, height: avatarSize }}
          >
            <UnratedReviewIcon size={avatarSize} />
          </span>
        </span>
      </HoverTooltip>
    );
  }

  return (
    <HoverTooltip
      label=""
      details={
        <div className="text-center">
          <HarborMark className="mx-auto mb-2 h-5 w-5 text-[#eba018]" />
          <span className="block font-normal text-ink-muted">
            {t("Harbor users average score")}
            {averageScore !== null ? ` · ${averageScore.toFixed(1)}/10` : ""}
            <br />
            {label}
          </span>
        </div>
      }
      side="top"
      align="end"
      className={`pointer-events-auto z-10 ${className}`}
    >
      <div
        role="img"
        aria-label={[
          totalCount > 0 ? label : "",
          averageScore !== null
            ? `${t("Harbor users average score")} ${averageScore.toFixed(1)}/10`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        className="flex items-center"
      >
        <span ref={badgeRef} className="inline-flex shrink-0 items-center">
          {shown.length > 0 && (
            <span className="relative z-10 inline-flex shrink-0 items-center">
              {shown.map((mark, i) => (
                <span
                  key={mark.handle}
                  className="relative inline-flex shrink-0 rounded-full bg-canvas ring-1 ring-canvas"
                  style={{
                    width: avatarSize,
                    height: avatarSize,
                    marginInlineStart: i === 0 ? 0 : -Math.round(avatarSize / 2),
                  }}
                >
                  <span className="inline-flex overflow-hidden rounded-full">
                    <Avatar src={mark.avatarUrl} size={avatarSize} alias={mark.alias} />
                  </span>
                  {i === shown.length - 1 && extra > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 z-10 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-elevated px-0.5 text-[8px] font-medium leading-none tabular-nums text-ink ring-1 ring-edge-soft">
                      +{extra}
                    </span>
                  )}
                </span>
              ))}
            </span>
          )}
          {averageScore !== null && (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 text-[12px] font-semibold leading-none tabular-nums text-ink"
              style={{
                height: avatarSize,
                backgroundColor: "color-mix(in srgb, var(--color-ink) 20%, var(--color-canvas))",
              }}
            >
              <span>{averageScore.toFixed(1)}</span>
            </span>
          )}
        </span>
      </div>
    </HoverTooltip>
  );
}
