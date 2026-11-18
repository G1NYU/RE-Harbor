import { useEffect, useMemo, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, BookmarkCheck, CalendarDays, Play, Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { Meta } from "@/lib/cinemeta";
import { tmdbSeasonEpisodes, type TmdbDetail } from "@/lib/providers/tmdb";
import { withTimeout } from "@/lib/progressive-rows";
import { useSettings } from "@/lib/settings";
import { useView, type PlayEpisode } from "@/lib/view";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import {
  episodesFromCinemeta,
  episodesFromTmdb,
  mergeEpisodes,
  type VoidEpisode,
} from "./title-episodes";
import "./void-title.css";

const DETAIL_TIMEOUT_MS = 10_000;
const EPISODES_PER_PAGE = 16;

/** Native VOID editorial title route; data, source discovery, and watchlist stay Harbor-native. */
export function VoidTitleWorkspace({
  meta,
  resolved,
  tmdb,
  loading,
  scrollRef,
  playLabel,
  onPlay,
  onTools,
}: {
  meta: Meta;
  resolved: Meta | null;
  tmdb: TmdbDetail | null;
  loading: boolean;
  scrollRef: RefObject<HTMLElement | null>;
  playLabel: string;
  onPlay: (episode?: PlayEpisode, seasonEpisodes?: PlayEpisode[]) => void;
  onTools: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { goBack } = useView();
  const type = meta.type === "series" ? "series" : "movie";
  const [seasonChoice, setSeasonChoice] = useState<number | null>(null);
  const [tmdbEpisodes, setTmdbEpisodes] = useState<VoidEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const title = tmdb?.title || resolved?.name || meta.name;
  const poster = resolved?.poster || tmdb?.poster || meta.poster;
  const backdrop = tmdb?.backdrop || resolved?.background || meta.background || poster;
  const description = tmdb?.overview || resolved?.description || meta.description;
  const genres = tmdb?.genres?.length ? tmdb.genres : (resolved?.genres ?? meta.genres ?? []);
  const imdbId = tmdb?.imdbId || (/^tt\d+$/.test(meta.id) ? meta.id : null);
  const watchlisted = useInWatchlist(meta.id, [imdbId]);
  const playMeta: Meta = useMemo(
    () => ({
      ...meta,
      ...resolved,
      id: meta.id,
      type: meta.type,
      name: title,
      videos: resolved?.videos?.length ? resolved.videos : meta.videos,
    }),
    [meta, resolved, title],
  );

  const seasons = useMemo(() => {
    const options = new Set<number>();
    for (const video of playMeta.videos ?? []) options.add(video.season ?? 1);
    for (const season of tmdb?.seasons ?? [])
      if (season.episodeCount > 0) options.add(season.seasonNumber);
    return [...options].sort((a, b) => a - b);
  }, [playMeta.videos, tmdb?.seasons]);
  const activeSeason =
    seasonChoice !== null && seasons.includes(seasonChoice)
      ? seasonChoice
      : (seasons.find((n) => n > 0) ?? seasons[0] ?? 1);

  useEffect(() => {
    let cancelled = false;
    setTmdbEpisodes([]);
    setShowAll(false);
    setEpisodesLoading(false);
    if (type !== "series" || !settings.tmdbKey || tmdb?.kind !== "tv") return;
    setEpisodesLoading(true);
    void withTimeout(tmdbSeasonEpisodes(settings.tmdbKey, tmdb.id, activeSeason), DETAIL_TIMEOUT_MS)
      .then((episodes) => {
        if (!cancelled) setTmdbEpisodes(episodesFromTmdb(episodes));
      })
      .catch(() => {
        if (!cancelled) setTmdbEpisodes([]);
      })
      .finally(() => {
        if (!cancelled) setEpisodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSeason, settings.tmdbKey, tmdb?.id, tmdb?.kind, type]);

  const cinemetaEpisodes = useMemo(
    () => episodesFromCinemeta(playMeta.videos ?? [], activeSeason),
    [playMeta.videos, activeSeason],
  );
  const episodes = useMemo(
    () => mergeEpisodes(cinemetaEpisodes, tmdbEpisodes),
    [cinemetaEpisodes, tmdbEpisodes],
  );
  const visibleEpisodes = showAll ? episodes : episodes.slice(0, EPISODES_PER_PAGE);
  const openEpisode = (entry: VoidEpisode) =>
    onPlay(
      entry.play,
      episodes.map((e) => e.play),
    );
  const addOrRemove = () =>
    toggleWatchlist({
      id: meta.id,
      type: meta.type,
      name: title,
      poster,
      imdbId,
      addonOrigin: meta.addonOrigin,
      videos: playMeta.videos,
    });

  return (
    <main ref={scrollRef} className="void-title" data-void-title data-kind={type}>
      <div className="void-title-scroll">
        <header className="void-title-topline">
          <button type="button" className="void-title-back" onClick={goBack}>
            <ArrowLeft size={18} /> Back to browsing
          </button>
        </header>

        <section className="void-title-feature" aria-label={title}>
          {backdrop && (
            <img className="void-title-feature-image" src={backdrop} alt="" decoding="async" />
          )}
          <div className="void-title-feature-shade" aria-hidden="true" />
          <div className="void-title-feature-body">
            <div className="void-title-poster">
              {poster && <img src={poster} alt={`${title} poster`} decoding="async" />}
            </div>
            <div className="void-title-feature-copy">
              <h1>{title}</h1>
              <div className="void-title-facts">
                {(tmdb?.year || meta.releaseInfo) && <span>{tmdb?.year || meta.releaseInfo}</span>}
                {(tmdb?.runtime || meta.runtime) && <span>{tmdb?.runtime || meta.runtime}</span>}
                {(tmdb?.rating || meta.imdbRating) && (
                  <span>★ {tmdb?.rating || meta.imdbRating}</span>
                )}
                {genres.slice(0, 2).map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
              {description && <p className="void-title-synopsis">{description}</p>}
              <div className="void-title-actions">
                <button
                  type="button"
                  data-tv-initial-focus
                  className="void-title-action-primary"
                  onClick={() => onPlay()}
                >
                  <Play size={18} fill="currentColor" />
                  {playLabel}
                </button>
                <button type="button" className="void-title-action-secondary" onClick={onTools}>
                  {t("More options")}
                </button>
                <button
                  type="button"
                  className="void-title-action-secondary"
                  onClick={addOrRemove}
                  aria-pressed={watchlisted}
                >
                  {watchlisted ? <BookmarkCheck size={19} /> : <Plus size={19} />}
                  {watchlisted ? "In watchlist" : "Add to watchlist"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <p className="void-title-progress" role="status">
            Loading title information…
          </p>
        )}
        {type === "series" && (
          <section className="void-title-episodes" aria-label="Episodes">
            <div className="void-title-section-head">
              <h2>{t("Episodes")}</h2>
            </div>
            {seasons.length > 0 && (
              <nav className="void-title-season-nav" aria-label="Seasons">
                {seasons.map((season) => (
                  <button
                    key={season}
                    type="button"
                    aria-current={season === activeSeason ? "true" : undefined}
                    onClick={() => setSeasonChoice(season)}
                  >
                    {season === 0 ? "Specials" : `Season ${String(season).padStart(2, "0")}`}
                  </button>
                ))}
              </nav>
            )}
            {episodesLoading && cinemetaEpisodes.length === 0 && (
              <p className="void-title-progress" role="status">
                Loading episodes…
              </p>
            )}
            {!loading && !episodesLoading && episodes.length === 0 && (
              <p className="void-title-progress">
                No episode list is available from the configured providers for this title.
              </p>
            )}
            <div className="void-title-episode-list">
              {visibleEpisodes.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className="void-title-episode"
                  onClick={() => openEpisode(entry)}
                >
                  <span className="void-title-episode-index">
                    {String(entry.number).padStart(2, "0")}
                  </span>
                  <span className="void-title-episode-still">
                    {entry.image ? (
                      <img src={entry.image} alt="" loading="lazy" />
                    ) : (
                      <Play size={20} />
                    )}
                  </span>
                  <span className="void-title-episode-copy">
                    <strong>{entry.title}</strong>
                    {entry.description && <span>{entry.description}</span>}
                  </span>
                  <span className="void-title-episode-end">
                    {entry.date ? (
                      <>
                        <CalendarDays size={14} />
                        {entry.date.slice(0, 10)}
                      </>
                    ) : (
                      ""
                    )}
                    <ArrowRight size={18} />
                  </span>
                </button>
              ))}
            </div>
            {!showAll && episodes.length > EPISODES_PER_PAGE && (
              <button type="button" className="void-title-more" onClick={() => setShowAll(true)}>
                Show all {episodes.length} episodes <ArrowRight size={17} />
              </button>
            )}
          </section>
        )}
        {tmdb?.cast && tmdb.cast.length > 0 && (
          <section className="void-title-credits" aria-label="Cast">
            <div className="void-title-section-head">
              <h2>{t("Cast")}</h2>
            </div>
            <div className="void-title-cast">
              {tmdb.cast.slice(0, 12).map((actor) => (
                <div className="void-title-actor" key={actor.id}>
                  <strong>{actor.name}</strong>
                  <span>{actor.character}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
