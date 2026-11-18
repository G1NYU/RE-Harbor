import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowRight, Clapperboard, Play, RefreshCw, Tv2, X } from "lucide-react";
import { Poster } from "@/components/poster";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useSidebarNavigation } from "@/chrome/context-page-navigation";
import { useParental } from "@/lib/parental";
import { topMovies, topSeries, type Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { CATALOG_REQUEST_TIMEOUT_MS, withTimeout } from "@/lib/progressive-rows";
import { useView } from "@/lib/view";
import { movieSpecs } from "@/views/movies/movie-specs";
import { showSpecs } from "@/views/shows/show-specs";
import "./void-watch.css";

type WatchKind = "movies" | "shows";
type WatchRow = { key: string; title: string; items: Meta[]; load: (page: number) => Promise<Meta[]>; page: number; hasMore: boolean };
type WatchSpec = { key: string; title: string; fetcher: (page: number) => Promise<Meta[]> };

function unique(items: Meta[]): Meta[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || !item.name || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function readSpecs(kind: WatchKind, tmdbKey: string, region: string): WatchSpec[] {
  if (tmdbKey) {
    const list = kind === "movies" ? movieSpecs(tmdbKey, region) : showSpecs(tmdbKey);
    // These sources are shared with Harbor's native catalog, but the composition is VOID's.
    return list.filter((spec) =>
      ["trending", "in-theaters", "on-the-air", "all-time-greats", "fresh", "hidden-gems", "net-hbo"].includes(spec.key)
    ).slice(0, 5);
  }
  return [{
    key: "popular",
    title: kind === "movies" ? "The essential films" : "Stories worth returning to",
    fetcher: (page) => kind === "movies" ? topMovies(undefined, (page - 1) * 100) : topSeries(undefined, (page - 1) * 100),
  }];
}

function WatchPoster({ item, onOpen }: { item: Meta; onOpen: () => void }) {
  return (
    <button type="button" className="void-watch-poster" onClick={onOpen} aria-label={`View ${item.name}`}>
      <span className="void-watch-poster-art">
        <Poster src={item.poster} seed={item.id} ratio="portrait" className="w-full [--poster-radius:7px]" lazy />
      </span>
      <span className="void-watch-poster-copy">
        <strong title={item.name}>{item.name}</strong>
        <span>{item.releaseInfo ?? (item.type === "movie" ? "Film" : "Series")}</span>
      </span>
    </button>
  );
}

/** A separate Watch application surface; content sources and playback remain Harbor-native. */
export function VoidWatchWorkspace({ kind, active = true }: { kind: WatchKind; active?: boolean }) {
  const { settings } = useSettings();
  const { setView, openMeta } = useView();
  const { entries } = useSidebarNavigation();
  const { unlock } = useParental();
  const [pendingView, setPendingView] = useState<WatchKind | null>(null);
  const destination = (target: WatchKind) => entries.find((entry) => entry.item.view === target);
  const navigate = (target: WatchKind) => {
    const entry = destination(target);
    if (!entry) return; // Hidden/disabled categories must not be reachable through this workspace.
    if (entry.gated) setPendingView(target);
    else setView(target);
  };
  const [rows, setRows] = useState<WatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState<Meta | null>(null);
  const [focused, setFocused] = useState<Meta | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const specs = useMemo(
    () => readSpecs(kind, settings.tmdbKey, settings.region),
    [kind, settings.tmdbKey, settings.region],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setRows([]);
    setFeatured(null);
    setFocused(null);
    setLoading(true);
    setError("");
    const fetchRows = async () => {
      const outcomes = await Promise.allSettled(specs.map((spec) => withTimeout(spec.fetcher(1), CATALOG_REQUEST_TIMEOUT_MS)));
      if (cancelled) return;
      const next: WatchRow[] = outcomes.flatMap((outcome, index) => {
        if (outcome.status !== "fulfilled") return [];
        const items = unique(outcome.value);
        const spec = specs[index];
        return spec && items.length ? [{
          key: spec.key, title: spec.title, items, load: spec.fetcher, page: 1,
          hasMore: items.length >= 15,
        }] : [];
      });
      // Match the working Harbor catalog fallback when a configured TMDB source fails.
      if (!next.length && specs.some((spec) => spec.key !== "popular")) {
        try {
          const fallback = unique(await withTimeout(kind === "movies" ? topMovies() : topSeries(), CATALOG_REQUEST_TIMEOUT_MS));
          if (cancelled) return;
          if (fallback.length) next.push({
            key: "popular",
            title: kind === "movies" ? "The essential films" : "Stories worth returning to",
            items: fallback,
            load: (page) => kind === "movies" ? topMovies(undefined, (page - 1) * 100) : topSeries(undefined, (page - 1) * 100),
            page: 1,
            hasMore: fallback.length >= 15,
          });
        } catch { /* The error state below is shown when both providers fail. */ }
      }
      setRows(next);
      setFeatured(next.flatMap((row) => row.items).find((item) => !!item.background) ??
        next[0]?.items[0] ?? null);
      setError(next.length ? "" : "No catalog results were available from your configured sources.");
      setLoading(false);
    };
    void fetchRows().catch((cause: unknown) => {
      if (cancelled) return;
      setError(String(cause));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, specs, retry]);

  useEffect(() => { setExpandedRow(null); }, [kind]);
  useEffect(() => {
    if (!focused) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [focused]);

  const showMore = async (row: WatchRow) => {
    if (loadingMore || !row.hasMore) return;
    setLoadingMore(row.key);
    try {
      const extra = unique(await withTimeout(row.load(row.page + 1), CATALOG_REQUEST_TIMEOUT_MS));
      setRows((current) => current.map((entry) => entry.key !== row.key ? entry : ({
        ...entry,
        page: entry.page + 1,
        items: unique([...entry.items, ...extra]),
        hasMore: extra.length >= 15 && unique([...entry.items, ...extra]).length > entry.items.length,
      })));
    } catch (cause) {
      setError(String(cause));
    } finally { setLoadingMore(null); }
  };

  const primary = focused ?? featured;
  const open = (item: Meta) => { setFocused(item); };
  const play = (item: Meta) => {
    // Keep existing stream selection, Stremio playback, watch-history and Refract routing.
    openMeta(item);
  };

  return (
    <main className="void-watch" data-void-watch data-kind={kind}>
      <div className="void-watch-scroll">
        <div className="void-watch-intro">
          <div className="void-watch-intro-heading">
            <span className="void-watch-overline">VOID / THE SCREENING ROOM</span>
            <h1>Watch something <em>worth remembering.</em></h1>
          </div>
          <nav aria-label="Screening categories" className="void-watch-modes">
            {destination("movies") && (
              <button type="button" data-selected={kind === "movies" || undefined} aria-current={kind === "movies" ? "page" : undefined} onClick={() => navigate("movies")}>
                <Clapperboard size={19} /> Films
              </button>
            )}
            {destination("shows") && (
              <button type="button" data-selected={kind === "shows" || undefined} aria-current={kind === "shows" ? "page" : undefined} onClick={() => navigate("shows")}>
                <Tv2 size={19} /> Series
              </button>
            )}
          </nav>
        </div>
        {primary && (
          <section className="void-watch-stage" aria-label={`Featured: ${primary.name}`}>
            <div className="void-watch-stage-art" aria-hidden="true">
              {(primary.background || primary.poster) && <img src={primary.background || primary.poster} alt="" decoding="async" />}
            </div>
            <div className="void-watch-stage-content">
              <span className="void-watch-overline">{kind === "movies" ? "FEATURE FILM" : "FEATURED SERIES"}</span>
              <h2>{primary.name}</h2>
              <p>{primary.description?.trim() || "Discover this story and choose how you want to watch it."}</p>
              <div className="void-watch-stage-meta">
                {primary.releaseInfo && <span>{primary.releaseInfo}</span>}
                {primary.imdbRating && <span>IMDb {primary.imdbRating}</span>}
                {primary.genres?.slice(0, 2).map((genre) => <span key={genre}>{genre}</span>)}
              </div>
              <div className="void-watch-stage-actions">
                <button type="button" className="void-watch-primary" onClick={() => play(primary)}><Play size={19} fill="currentColor" /> Open title</button>
                <button type="button" className="void-watch-secondary" onClick={() => setFocused(null)} disabled={!focused}>Return to featured</button>
              </div>
            </div>
            <div className="void-watch-stage-index" aria-hidden="true">01 / VOID</div>
          </section>
        )}
        {loading && (
          <div className="void-watch-feedback" role="status">
            <Clapperboard size={22} /> Building your screening room…
          </div>
        )}
        {error && (
          <div className="void-watch-feedback" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={16} /> Retry catalogs</button>
          </div>
        )}
        {!loading && rows.length > 0 && (
          <>
            <div className="void-watch-editorial-divider">
              <span className="void-watch-overline">THE PROGRAM</span>
              <span>{kind === "movies" ? "Film selections" : "Series selections"}</span>
              <ArrowDown size={19} />
            </div>
            {rows.map((row, index) => (
              <section className="void-watch-collection" key={row.key} aria-label={row.title}>
                <header className="void-watch-collection-heading">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h3>{row.title}</h3>
                  <button type="button" onClick={() => setExpandedRow((current) => current === row.key ? null : row.key)}>
                    {expandedRow === row.key ? "Show less" : "View collection"} <ArrowRight size={17}/>
                  </button>
                </header>
                <div className={`void-watch-filmstrip ${expandedRow === row.key ? "void-watch-filmstrip-expanded" : ""}`}>
                  {(expandedRow === row.key ? row.items : row.items.slice(0, 10)).map((item) => (
                    <WatchPoster key={item.id} item={item} onOpen={() => open(item)}/>
                  ))}
                </div>
                {expandedRow === row.key && row.hasMore && (
                  <button type="button" className="void-watch-more" disabled={loadingMore === row.key} onClick={() => void showMore(row)}>
                    {loadingMore === row.key ? "Loading…" : "Load more titles"} <ArrowRight size={17}/>
                  </button>
                )}
              </section>
            ))}
          </>
        )}
      </div>
      {pendingView && (
        <ParentalPinModal
          verify={unlock}
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const target = pendingView;
              setPendingView(null);
              if (target) setView(target);
            },
            onCancel: () => setPendingView(null),
          }}
        />
      )}
      {focused && (
        <section className="void-watch-focus" role="dialog" aria-modal="false" aria-label={focused.name}>
          <button className="void-watch-focus-close" type="button" onClick={() => setFocused(null)} aria-label="Close details"><X size={20} /></button>
          <div className="void-watch-focus-art"><Poster src={focused.poster} seed={focused.id} ratio="portrait" /></div>
          <span className="void-watch-overline">SELECTED FOR YOU</span>
          <h2>{focused.name}</h2>
          <p>{focused.description || "No synopsis available from this catalog."}</p>
          <button className="void-watch-primary" type="button" onClick={() => play(focused)}>
            <Play size={19} fill="currentColor" /> Explore title & playback
          </button>
        </section>
      )}
    </main>
  );
}
