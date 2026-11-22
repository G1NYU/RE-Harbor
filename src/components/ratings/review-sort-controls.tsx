import { useT } from "@/lib/i18n";
import type { RatingSort } from "@/lib/social/review-rank";

const SORTS: RatingSort[] = ["recent", "liked", "commented", "highest", "lowest"];

export function ReviewSortControls({
  value,
  onChange,
  compact = false,
}: {
  value: RatingSort;
  onChange: (sort: RatingSort) => void;
  compact?: boolean;
}) {
  const t = useT();
  const labels: Record<RatingSort, string> = {
    recent: t("Most recent"),
    liked: t("Most liked"),
    commented: t("Most comments"),
    highest: t("Highest rated"),
    lowest: t("Lowest rated"),
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
        {t("Sort by")}
      </span>
      <div
        role="radiogroup"
        aria-label={t("Sort reviews")}
        className={`flex min-w-0 flex-wrap items-center gap-1 rounded-full border border-edge-soft/70 bg-elevated/35 p-1 shadow-[0_0_18px_rgba(255,255,255,0.035)] backdrop-blur-sm ${compact ? "" : ""}`}
      >
        {SORTS.map((sort) => (
          <button
            key={sort}
            type="button"
            role="radio"
            aria-checked={value === sort}
            onClick={() => onChange(sort)}
            className={`h-7 rounded-full px-2.5 text-[11.5px] font-medium transition-colors ${
              value === sort
                ? "border border-edge-soft/80 bg-surface/90 text-ink shadow-[0_0_12px_rgba(255,255,255,0.06)]"
                : "border border-transparent text-ink-subtle hover:border-edge-soft/60 hover:bg-surface/45 hover:text-ink"
            }`}
          >
            {labels[sort]}
          </button>
        ))}
      </div>
    </div>
  );
}
