import { useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, CalendarDays, Check, Ellipsis, Play } from "lucide-react";
import { manualEpisodeKeys, manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { requireMediaActionSuccess, setContextWatched } from "@/lib/media-context-actions";
import type { Meta } from "@/lib/cinemeta";
import { CoverImg } from "@/components/cover-img";
import { episodesThroughInSeason, type VoidEpisode } from "./title-episodes";

export function VoidEpisodeRow({
  entry,
  episodes,
  meta,
  imdbId,
  onPlay,
}: {
  entry: VoidEpisode;
  episodes: VoidEpisode[];
  meta: Meta;
  imdbId: string | null;
  onPlay: (episode: VoidEpisode) => void;
}) {
  const watchedVersion = useSyncExternalStore(
    subscribeManualWatched,
    manualWatchedVersion,
    manualWatchedVersion,
  );
  const manual = useMemo(() => manualEpisodeKeys(meta.id), [meta.id, watchedVersion]);
  const watched = manual.watched.has(`${entry.play.season}:${entry.play.episode}`);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const through = useMemo(() => episodesThroughInSeason(episodes, entry), [episodes, entry]);

  const update = async (next: boolean, bulk = false) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await setContextWatched({ ...meta, type: "series" }, next, {
        imdbId,
        ...(bulk ? { episodes: through } : { episode: entry.play }),
      });
      requireMediaActionSuccess(result);
      setExpanded(false);
    } catch (cause) {
      // A provider may fail after Harbor has persisted the change. The subscription
      // still refreshes the badge; show the partial-failure message rather than guessing.
      setError(cause instanceof Error ? cause.message : "Could not update watched status.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="void-title-episode-shell" data-watched={watched || undefined}>
      <button type="button" className="void-title-episode" onClick={() => onPlay(entry)}>
        <span className="void-title-episode-index">{String(entry.number).padStart(2, "0")}</span>
        <span className="void-title-episode-still">
          {entry.image ? <CoverImg src={entry.image} alt="" loading="lazy" /> : <Play size={20} />}
        </span>
        <span className="void-title-episode-copy">
          <strong>{entry.title}</strong>
          {entry.description && <span>{entry.description}</span>}
        </span>
        <span className="void-title-episode-end">
          {watched && <><Check size={15} /><span>Watched</span></>}
          {!watched && entry.date && <><CalendarDays size={14} />{entry.date.slice(0, 10)}</>}
          <ArrowRight size={18} />
        </span>
      </button>
      <button
        type="button"
        className="void-title-episode-options"
        aria-label={`Episode actions: ${entry.title}`}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((value) => !value);
          setError(null);
        }}
      >
        <Ellipsis size={20} />
      </button>
      {expanded && (
        <div className="void-title-episode-actions" aria-label={`Actions for ${entry.title}`}>
          <span>EPISODE {String(entry.number).padStart(2, "0")}</span>
          <button type="button" disabled={pending} onClick={() => void update(!watched)}>
            {watched ? "Mark as unwatched" : "Mark as watched"}
          </button>
          {!watched && through.length > 1 && (
            <button type="button" disabled={pending} onClick={() => void update(true, true)}>
              Mark {through.length} episodes in this season watched
            </button>
          )}
          {pending && <p role="status">Updating your watch history…</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
