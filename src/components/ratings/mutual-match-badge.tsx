import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { getMutualMatch } from "@/lib/social/mutual-ratings";
import { mutualScoreTone, type MutualMatch } from "@/lib/social/mutual-score";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { observe } from "@/lib/visibility";

export function MutualMatchLabel({ match }: { match?: MutualMatch }) {
  const t = useT();
  if (match?.score == null) return null;
  const tone = mutualScoreTone(match.score);
  return (
    <span
      title={t("Based on {n} mutual ratings", { n: match.count })}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-canvas/40 px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${tone.text} ${tone.ring}`}
    >
      {t("{score}% match", { score: match.score })}
    </span>
  );
}

export function MutualMatchBadge({ handle, lazy = false }: { handle?: string; lazy?: boolean }) {
  const viewer = useSyncExternalStore(subscribeAuthor, currentAuthor);
  const target = handle?.trim().toLowerCase();
  const viewerId = target && target !== viewer?.handle?.toLowerCase() ? viewer?.id : undefined;
  const key = viewerId && target ? JSON.stringify([viewerId, target]) : undefined;
  const anchor = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; score: number | null; count: number }>();

  useEffect(() => {
    if (!key || !viewerId || !target) return;
    let alive = true;
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      void getMutualMatch(viewerId, target)
        .then((match) => {
          if (alive) setResult({ key, ...match });
        })
        .catch(() => {
          // The match badge is supplemental; a failed lookup leaves the rating visible.
        });
    };
    const stop =
      lazy && anchor.current && typeof IntersectionObserver !== "undefined"
        ? observe(anchor.current, (visible) => {
            if (visible) load();
          })
        : undefined;
    if (!stop) load();
    return () => {
      alive = false;
      stop?.();
    };
  }, [key, lazy, target, viewerId]);

  if (!key) return null;
  const match = result?.key === key ? result : undefined;
  if (match?.score == null) {
    return <span ref={anchor} aria-hidden="true" className="absolute size-px" />;
  }

  return <MutualMatchLabel match={match} />;
}
