import { useMemo } from "react";
import {
  ArrowUpRight,
  FolderOpen,
  Library,
  ListMusic,
  Music2,
  Pause,
  Play,
} from "@/components/icons/music-icons";
import { Poster } from "@/components/poster";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { getMusicState, toggleMusicPlayback } from "@/lib/music/player";
import { useMusicNowPlaying } from "@/lib/music/use-now-playing";
import { useMusicSourcePicker } from "@/components/music/music-source-picker";
import type { MusicCatalogItem, MusicCatalogRow, MusicTrack } from "@/lib/music/types";
import "./music-listening-home.css";

function trackKey(track: MusicTrack): string {
  return [track.connectorId ?? "music", track.sourceId ?? track.id].join(":");
}

export function MusicListeningHome({
  recent,
  onLibrary,
  onConnect,
  onYouTube,
  onPlaylists,
  onTastes,
}: {
  rows: MusicCatalogRow[];
  recent: MusicTrack[];
  loading: boolean;
  active?: boolean;
  onOpen: (item: MusicCatalogItem, siblings: MusicCatalogItem[]) => void;
  onLibrary: () => void;
  onConnect: (id?: string) => void;
  onYouTube: () => void;
  onPlaylists: () => void;
  onTastes: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const voidEdition = settings.theme.preset === "cool-grey";
  const now = useMusicNowPlaying();
  const activeTrack = getMusicState().current;
  const { openSourcePicker } = useMusicSourcePicker();

  // A deterministic personal selection: never rotate or autoplay a provider's
  // arbitrary featured track. Keep its identity stable when the catalog refreshes.
  const recents = useMemo(() => {
    const seen = new Set<string>();
    return recent.filter((track) => {
      const key = trackKey(track);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }, [recent]);
  const subject = activeTrack ?? recents[0];
  const subjectKey = subject ? trackKey(subject) : "";
  const isCurrent = subjectKey !== "" && !!activeTrack && subjectKey === trackKey(activeTrack);
  const playing = isCurrent && now.phase === "playing";

  const play = (track: MusicTrack) => {
    if (activeTrack && trackKey(activeTrack) === trackKey(track)) {
      toggleMusicPlayback();
      return;
    }
    openSourcePicker(track, recents.length ? recents : [track]);
  };

  return (
    <div className="music-room-home" data-music-premium>
      <section className="music-room-feature" aria-label={t("music.home.title")} data-has-art={subject?.artwork ? "1" : undefined}>
        {subject?.artwork && (
          <div className="music-room-backdrop" aria-hidden="true">
            <img key={subjectKey} src={subject.artwork} alt="" decoding="async" draggable={false} />
          </div>
        )}
        <div className="music-room-feature-content">
          <span className="music-room-eyebrow">
            {subject ? t("music.hero.resumeKicker") : t("music.home.discover")}
          </span>
          <h2 title={subject?.title}>
            {subject?.title ?? t("music.home.title")}
          </h2>
          <p className="music-room-description">
            {subject?.artist ?? t("music.home.body")}
          </p>
          <div className="music-room-feature-actions">
            {subject ? (
              <button
                type="button"
                className="music-room-main-action"
                onClick={() => play(subject)}
              >
                {playing ? <Pause size={22} aria-hidden="true" /> : <Play size={22} aria-hidden="true" />}
                {playing ? t("music.pause") : t("music.hero.resumeCta")}
              </button>
            ) : (
              <button type="button" className="music-room-main-action" onClick={onLibrary}>
                <Library size={21} aria-hidden="true" />
                {t("music.library")}
              </button>
            )}
            <button type="button" className="music-room-secondary-action" onClick={onPlaylists}>
              <ListMusic size={19} aria-hidden="true" />
              {t("music.taste.playlists")}
            </button>
          </div>
        </div>
        <div className="music-room-cover-shell" aria-hidden="true">
          {subject?.artwork ? (
            <Poster
              src={subject.artwork}
              seed={"music-room:" + subjectKey}
              ratio="square"
              className="music-room-cover [--poster-radius:12px]"
            />
          ) : (
            <div className="music-room-cover-placeholder">
              <Music2 size={64} aria-hidden="true" />
            </div>
          )}
        </div>
        {voidEdition && recents.some((track) => trackKey(track) !== subjectKey) && (
          <aside className="void-music-feature-queue" aria-label={t("music.library.recent")}>
            <div className="void-music-feature-queue-heading">
              <span>{t("music.library.recent")}</span>
              <ListMusic size={18} aria-hidden="true" />
            </div>
            <div className="void-music-feature-queue-list">
              {recents.filter((track) => trackKey(track) !== subjectKey).slice(0, 3).map((track) => (
                <button
                  type="button"
                  className="void-music-feature-queue-track"
                  key={trackKey(track)}
                  onClick={() => play(track)}
                  aria-label={t("music.playTrack", { title: track.title, artist: track.artist })}
                >
                  <span className="void-music-feature-queue-art" aria-hidden="true">
                    <Poster src={track.artwork} seed={"music-room:" + trackKey(track)} ratio="square" className="w-full [--poster-radius:6px]" />
                  </span>
                  <span className="void-music-feature-queue-copy">
                    <strong title={track.title}>{track.title}</strong>
                    <small title={track.artist}>{track.artist}</small>
                  </span>
                  <Play size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          </aside>
        )}
      </section>

      <nav className="music-room-shortcuts" aria-label={t("music.hero.startCta")}>
        <button type="button" onClick={onLibrary}>
          <Library size={22} aria-hidden="true" />
          <span>{t("music.library")}</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onYouTube}>
          <Music2 size={22} aria-hidden="true" />
          <span>YouTube Music</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onConnect("local")}>
          <FolderOpen size={22} aria-hidden="true" />
          <span>{t("music.home.addFolder")}</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onTastes}>
          <ListMusic size={22} aria-hidden="true" />
          <span>{t("music.taste.choose")}</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </nav>

      {recents.length > 0 && (
        <section className="music-room-recent" aria-label={t("music.library.recent")}>
          <div className="music-room-section-heading">
            <h3>{t("music.library.recent")}</h3>
            <button type="button" onClick={onLibrary}>
              {t("music.library")}
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="music-room-recent-grid">
            {recents.map((track) => (
              <button
                key={trackKey(track)}
                type="button"
                onClick={() => play(track)}
                aria-label={t("music.playTrack", { title: track.title, artist: track.artist })}
                className="music-room-recent-track"
              >
                <span className="music-room-recent-art">
                  <Poster
                    src={track.artwork}
                    seed={"music-room:" + trackKey(track)}
                    ratio="square"
                    className="w-full [--poster-radius:10px]"
                  />
                </span>
                <span className="music-room-recent-title" title={track.title}>{track.title}</span>
                <span className="music-room-recent-artist" title={track.artist}>{track.artist}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
