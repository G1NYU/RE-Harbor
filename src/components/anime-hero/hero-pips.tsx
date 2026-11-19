import { useT } from "@/lib/i18n";

const MAX_PIPS = 8;

export function HeroPips({
  total,
  active,
  onSelect,
}: {
  total: number;
  active: number;
  onSelect: (i: number) => void;
}) {
  const t = useT();
  const windowed = total > MAX_PIPS;
  const start = windowed
    ? Math.max(0, Math.min(active - Math.floor(MAX_PIPS / 2), total - MAX_PIPS))
    : 0;
  const count = windowed ? MAX_PIPS : total;
  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-x-2">
      <div className="flex flex-wrap justify-end">
        {Array.from({ length: count }, (_, k) => {
          const i = start + k;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={t("Slide {n}", { n: i + 1 })}
              aria-current={i === active ? "true" : undefined}
              className="group grid h-7 w-7 place-items-center rounded focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden
                className={`h-1.5 rounded-full ${i === active ? "w-6 bg-ink" : "w-3 bg-ink-muted group-hover:bg-ink"}`}
              />
            </button>
          );
        })}
      </div>
      {windowed && (
        <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-ink">
          {active + 1} / {total}
        </span>
      )}
    </div>
  );
}
