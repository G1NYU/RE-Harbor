import { useEffect, useMemo, useState } from "react";
import { ArrowDown, Check, CirclePlay, Download, HardDrive, RefreshCcw, SlidersHorizontal } from "lucide-react";
import type { ScoredStream, Tier } from "@/lib/streams/types";
import { FACET_DIMS, facetOptions, matchesFacets, type FacetState } from "@/views/play-picker/stream-facets";
import "./void-source-board.css";

const INITIAL_RESULTS = 32;
const TIER_ORDER: Tier[] = ["4K_DV", "4K_HDR", "4K", "1080p_HDR", "1080p", "720p", "SD", "ROUGH"];
type DownloadState = "idle" | "preparing" | "queued";
type VoidSourceBoardProps = {
  streams: ScoredStream[];
  download: boolean;
  currentPick: ScoredStream | null;
  failedStreams: Set<ScoredStream>;
  resolving: ScoredStream | null;
  matchFor?: (stream: ScoredStream) => "same" | "close" | null;
  downloadStateFor: (stream: ScoredStream) => DownloadState;
  onPlay: (stream: ScoredStream) => void;
  onManageFilters: () => void;
};

function streamTitle(stream: ScoredStream): string {
  return stream.parsedTitle || stream.title || stream.name || `${stream.resolution} source`;
}
function shortSize(bytes: number | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
function sourceInfo(stream: ScoredStream): string[] {
  return [
    stream.resolution,
    stream.hdrFormat,
    stream.source !== "Other" ? stream.source : null,
    stream.codec !== "Other" ? stream.codec : null,
    shortSize(stream.size),
  ].filter((value): value is string => Boolean(value));
}
function knownCached(stream: ScoredStream): boolean {
  return Object.values(stream.cached ?? {}).some(Boolean);
}
function stateLabel(download: boolean, state: DownloadState, resolving: boolean): string {
  if (state === "queued") return "Queued";
  if (resolving || state === "preparing") return download ? "Preparing…" : "Opening…";
  return download ? "Download" : "Play source";
}

/** Independent source browser; Harbor retains ranking, resolution and playback decisions. */
export function VoidSourceBoard({
  streams, download, currentPick, failedStreams, resolving, matchFor, downloadStateFor, onPlay, onManageFilters,
}: VoidSourceBoardProps) {
  const [provider, setProvider] = useState("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [cachedOnly, setCachedOnly] = useState(false);
  const [limit, setLimit] = useState(INITIAL_RESULTS);
  const [advanced, setAdvanced] = useState(false);
  const [facets, setFacets] = useState<FacetState>({});
  const providers = useMemo(() => {
    const grouped = new Map<string, { name: string; count: number }>();
    for (const stream of streams) {
      const key = stream.addonUrl || stream.addonId;
      const entry = grouped.get(key);
      if (entry) entry.count++;
      else grouped.set(key, { name: stream.addonName || stream.addonId, count: 1 });
    }
    return [...grouped.entries()].map(([key, value]) => ({ key, ...value }));
  }, [streams]);
  const tiers = useMemo(() => TIER_ORDER.filter((value) => streams.some((stream) => stream.tier === value)), [streams]);
  const hasCached = streams.some(knownCached);
  const extraDims = FACET_DIMS.filter((dim) => !["resolution", "cached"].includes(dim.key));

  useEffect(() => {
    if (provider !== "all" && !providers.some((item) => item.key === provider)) setProvider("all");
    if (tier !== "all" && !tiers.includes(tier)) setTier("all");
    if (cachedOnly && !hasCached) setCachedOnly(false);
  }, [provider, providers, tier, tiers, cachedOnly, hasCached]);

  const filtered = useMemo(() => streams.filter((stream) =>
    (provider === "all" || (stream.addonUrl || stream.addonId) === provider) &&
    (tier === "all" || stream.tier === tier) &&
    (!cachedOnly || knownCached(stream)) && matchesFacets(stream, facets)
  ), [streams, provider, tier, cachedOnly, facets]);
  const best = filtered.find((stream) => stream === currentPick) ?? filtered[0] ?? null;
  const rest = filtered.filter((stream) => stream !== best);
  const visible = rest.slice(0, limit);
  const play = (stream: ScoredStream) => {
    if (downloadStateFor(stream) === "queued" || resolving === stream) return;
    onPlay(stream);
  };
  const label = (stream: ScoredStream) => stateLabel(download, downloadStateFor(stream), resolving === stream);

  return (
    <section className="void-source-board" data-void-source-board aria-label="Available sources">
      <header className="void-source-heading">
        <span>VOID / PLAYBACK SOURCES</span>
        <h3>Choose your way in.</h3>
        <p>{filtered.length} of {streams.length} sources shown across {providers.length} providers</p>
      </header>
      <div className="void-source-filters" aria-label="Filter sources">
        <label><span>Provider</span>
          <select value={provider} onChange={(event) => { setProvider(event.target.value); setLimit(INITIAL_RESULTS); }}>
            <option value="all">All providers</option>
            {providers.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} ({entry.count})</option>)}
          </select>
        </label>
        <label><span>Quality</span>
          <select value={tier} onChange={(event) => { setTier(event.target.value as Tier | "all"); setLimit(INITIAL_RESULTS); }}>
            <option value="all">All qualities</option>
            {tiers.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        {hasCached && <button type="button" className="void-source-filter-toggle" aria-pressed={cachedOnly} onClick={() => { setCachedOnly((value) => !value); setLimit(INITIAL_RESULTS); }}>
          <HardDrive size={16} /> Cached only {cachedOnly && <Check size={14} />}
        </button>}
      </div>
      <div className="void-source-extra-actions">
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>
          <SlidersHorizontal size={17} /> {advanced ? "Hide advanced filters" : "Advanced filters"}
        </button>
        <button type="button" onClick={onManageFilters}>Manage saved filters</button>
      </div>
      {advanced && <div className="void-source-advanced" aria-label="Advanced source filters">
        {extraDims.map((dim) => (
          <label key={dim.key}><span>{dim.label}</span>
            <select value={facets[dim.key] || "all"} onChange={(event) => {
              setFacets((current) => ({ ...current, [dim.key]: event.target.value }));
              setLimit(INITIAL_RESULTS);
            }}>
              <option value="all">All {dim.label.toLowerCase()}</option>
              {facetOptions(streams, dim).map((option) => <option key={option.key} value={option.key}>{option.key} ({option.count})</option>)}
            </select>
          </label>
        ))}
      </div>}
      {best && (
        <button type="button" className="void-source-feature" onClick={() => play(best)}
          disabled={downloadStateFor(best) === "queued" || resolving === best}
          aria-label={`${label(best)}: ${streamTitle(best)}`}>
          <span className="void-source-feature-top"><span>01 / FEATURED SOURCE</span>{knownCached(best) && <span>Cached</span>}</span>
          <strong>{streamTitle(best)}</strong>
          <span className="void-source-feature-specs">{sourceInfo(best).map((detail) => <span key={detail}>{detail}</span>)}</span>
          <span className="void-source-feature-bottom">
            <span>{best.addonName || best.addonId}{failedStreams.has(best) ? " · Previous attempt failed" : ""}</span>
            <span className="void-source-feature-cta">{download ? <Download size={18} /> : <CirclePlay size={20} />} {label(best)}</span>
          </span>
        </button>
      )}
      {visible.length > 0 && <div className="void-source-list-head"><span>MORE CONNECTIONS</span><span>{rest.length} alternatives</span></div>}
      <div className="void-source-list">
        {visible.map((stream, index) => {
          const queued = downloadStateFor(stream) === "queued";
          const busy = resolving === stream;
          const match = matchFor?.(stream);
          return (
            <button type="button" className="void-source-row"
              key={`${stream.addonUrl || stream.addonId}:${stream.url || stream.infoHash || stream.parsedTitle}:${index}`}
              onClick={() => play(stream)} disabled={queued || busy}
              aria-label={`${label(stream)}: ${streamTitle(stream)}`}>
              <span className="void-source-row-number">{String(index + 2).padStart(2, "0")}</span>
              <span className="void-source-row-main">
                <strong>{streamTitle(stream)}</strong>
                <span>{stream.addonName || stream.addonId}{match ? ` · ${match === "same" ? "Party match" : "Close to party source"}` : ""}</span>
              </span>
              <span className="void-source-row-detail">
                <strong>{stream.tier.replaceAll("_", " ")}</strong>
                <span>{shortSize(stream.size) || stream.source}{knownCached(stream) ? " · Cached" : ""}</span>
              </span>
              <span className="void-source-row-action">{busy ? <RefreshCcw size={19} /> : queued ? <Check size={19} /> : download ? <Download size={19} /> : <CirclePlay size={20} />}</span>
            </button>
          );
        })}
      </div>
      {rest.length > limit && <button type="button" className="void-source-more" onClick={() => setLimit((n) => n + INITIAL_RESULTS)}>
        Show {Math.min(INITIAL_RESULTS, rest.length - limit)} more sources <ArrowDown size={17} />
      </button>}
      {!best && <div className="void-source-empty" role="status">No sources match these filters. Try another provider or quality.</div>}
    </section>
  );
}
