import { useState, type Dispatch, type SetStateAction } from "react";
import {
  RefreshCw,
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
} from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { useT } from "@/lib/i18n";
import type { DiscoveryOrder } from "@/lib/social/user-discovery";

export type DiscoveryOptions = {
  query: string;
  minMatch: number | null;
  minShared: number;
  minRatings: number;
  canvas: boolean;
  orders: DiscoveryOrder[];
  reviewDirection: "asc" | "desc";
};
export const DEFAULT_DISCOVERY_OPTIONS: DiscoveryOptions = {
  query: "",
  minMatch: null,
  minShared: 10,
  minRatings: 0,
  canvas: false,
  orders: [],
  reviewDirection: "desc",
};
export function DiscoveryControls({
  options,
  onChange,
  onRefresh,
  signedIn,
  loading,
}: {
  options: DiscoveryOptions;
  onChange: Dispatch<SetStateAction<DiscoveryOptions>>;
  onRefresh: () => void;
  signedIn: boolean;
  loading: boolean;
}) {
  const t = useT();
  const [custom, setCustom] = useState(false);
  const reviewsOnly = options.orders.length === 1 && options.orders[0] === "reviews";
  const ascending = options.reviewDirection === "asc";
  const sorts = [
    { value: "username", label: t("A–Z") },
    { value: "activity", label: t("Recent activity") },
    { value: "reviews", label: t("Written reviews") },
    { value: "newest", label: t("Newest members") },
    { value: "oldest", label: t("Oldest members") },
  ];
  const update = (patch: Partial<DiscoveryOptions>) =>
    onChange((previous) => ({ ...previous, ...patch }));
  const clear = () => {
    onChange(DEFAULT_DISCOVERY_OPTIONS);
    setCustom(false);
  };
  return (
    <section
      aria-label={t("Discover people filters")}
      className="mb-6 rounded-2xl bg-surface p-4 ring-1 ring-edge-soft"
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-canvas px-4 ring-1 ring-edge-soft focus-within:ring-edge">
          <Search size={17} className="text-ink-subtle" />
          <input
            aria-label={t("Search people")}
            placeholder={t("Search by name or @handle")}
            value={options.query}
            onChange={(event) => update({ query: event.target.value })}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 text-ink-muted ring-1 ring-edge-soft">
          <button
            type="button"
            disabled={!reviewsOnly}
            aria-label={
              reviewsOnly
                ? ascending
                  ? t("Show most written reviews first")
                  : t("Show least written reviews first")
                : t("Select only Written reviews to change order")
            }
            title={
              reviewsOnly
                ? ascending
                  ? t("Least written reviews first")
                  : t("Most written reviews first")
                : t("Select only Written reviews to change order")
            }
            onClick={() => update({ reviewDirection: ascending ? "desc" : "asc" })}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-elevated enabled:hover:text-ink disabled:opacity-40"
          >
            {!reviewsOnly ? (
              <ArrowDownUp size={16} />
            ) : ascending ? (
              <ArrowUpWideNarrow size={16} />
            ) : (
              <ArrowDownWideNarrow size={16} />
            )}
          </button>
          <Dropdown
            ariaLabel={t("Sort people")}
            value={options.orders[0] ?? ""}
            selectedValues={options.orders}
            selectionLabel={
              options.orders.length
                ? options.orders
                    .map((key) => sorts.find((item) => item.value === key)!.label)
                    .join(" · ")
                : t("Sort by")
            }
            options={sorts}
            onChange={(value) =>
              onChange((previous) => ({
                ...previous,
                orders: previous.orders.includes(value as DiscoveryOrder)
                  ? previous.orders.filter((key) => key !== value)
                  : value === "newest" || value === "oldest"
                    ? [value]
                    : [
                        ...previous.orders.filter((key) => key !== "newest" && key !== "oldest"),
                        value as DiscoveryOrder,
                      ],
              }))
            }
            className="w-full sm:w-56"
            size="sm"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {[
          {
            score: 75,
            tone: "text-emerald-400 ring-emerald-400/35 bg-emerald-400/10",
            selected: "ring-emerald-400 bg-emerald-400/20",
          },
          {
            score: 50,
            tone: "text-yellow-300 ring-yellow-300/35 bg-yellow-300/10",
            selected: "ring-yellow-300 bg-yellow-300/20",
          },
          {
            score: 25,
            tone: "text-orange-400 ring-orange-400/35 bg-orange-400/10",
            selected: "ring-orange-400 bg-orange-400/20",
          },
        ].map((preset) => (
          <button
            type="button"
            key={preset.score}
            disabled={!signedIn}
            title={
              !signedIn
                ? t("Sign in to compare your ratings.")
                : t("Based on at least {n} shared ratings", { n: options.minShared })
            }
            aria-pressed={options.minMatch === preset.score}
            onClick={() =>
              update({ minMatch: options.minMatch === preset.score ? null : preset.score })
            }
            className={`min-h-9 rounded-full px-3.5 text-xs font-medium ring-1 transition-colors disabled:opacity-40 ${preset.tone} ${options.minMatch === preset.score ? preset.selected : "hover:brightness-125"}`}
          >
            {t("{score}% Match & above", { score: preset.score })}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={options.canvas}
          title={t(
            "Profiles with a custom HTML/CSS layout enabled or saved. Choosing a theme alone does not count.",
          )}
          onClick={() => update({ canvas: !options.canvas })}
          className={`min-h-9 rounded-full px-3.5 text-xs font-medium ring-1 transition-colors ${options.canvas ? "bg-accent/15 text-accent ring-accent/40" : "bg-canvas text-ink-muted ring-edge-soft hover:bg-elevated"}`}
        >
          {t("Custom profile")}
        </button>
        <button
          type="button"
          aria-label={t("Customize filters")}
          title={t("Customize filters")}
          aria-expanded={custom}
          onClick={() => setCustom(!custom)}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs ring-1 ${custom ? "bg-accent/15 text-accent ring-accent/40" : "bg-canvas text-ink-muted ring-edge-soft hover:bg-elevated"}`}
        >
          <SlidersHorizontal size={13} />
        </button>
        {(options.query ||
          options.minMatch != null ||
          options.minRatings > 0 ||
          options.canvas ||
          options.orders.length > 0) && (
          <button
            type="button"
            onClick={clear}
            className="min-h-9 px-2 text-xs text-ink-subtle hover:text-ink"
          >
            {t("Clear filters")}
          </button>
        )}
      </div>
      {custom && (
        <div className="mt-4 grid gap-4 rounded-xl bg-canvas/50 p-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-ink-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={options.minMatch != null}
              disabled={!signedIn}
              onChange={(event) => update({ minMatch: event.target.checked ? 50 : null })}
              className="accent-accent"
            />
            {t("Filter by match score")}
          </label>
          <DiscoverySlider
            label={t("Minimum match")}
            value={options.minMatch ?? 50}
            min={0}
            max={100}
            suffix="%"
            disabled={!signedIn || options.minMatch == null}
            onChange={(value) => update({ minMatch: value })}
          />
          <DiscoverySlider
            label={t("Minimum shared titles")}
            value={options.minShared}
            min={1}
            max={500}
            disabled={!signedIn || options.minMatch == null}
            onChange={(value) => update({ minShared: value })}
          />
          <DiscoverySlider
            label={t("Minimum ratings")}
            value={options.minRatings}
            min={0}
            max={1000}
            onChange={(value) => update({ minRatings: value })}
          />
          <p className="text-[11px] leading-relaxed text-ink-subtle">
            {t(
              "Match filters use titles you both rated. A minimum of 0 total ratings includes all accounts.",
            )}
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-edge-soft pt-3">
        {options.orders.length > 1 && (
          <p className="me-auto text-[11px] text-ink-subtle">
            {t("Sorts apply in selection order.")}
          </p>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title={t("Shuffle matching people. Selected sorts stay applied.")}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs text-ink-muted hover:bg-elevated hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("Refresh")}
        </button>
      </div>
    </section>
  );
}
function DiscoverySlider({
  label,
  value,
  min,
  max,
  suffix = "",
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`grid gap-2 text-xs text-ink-muted ${disabled ? "opacity-40" : ""}`}>
      <span className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="tabular-nums text-ink">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}
