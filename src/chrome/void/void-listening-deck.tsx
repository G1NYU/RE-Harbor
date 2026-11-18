import { MusicSourcePicker } from "@/components/music/music-source-picker";
import { requestMusicConnection } from "@/components/music/music-connections";
import { MusicSpeakers } from "@/components/music/music-speakers";
import { MusicAudioSettings } from "@/components/music/music-audio-settings";
import { musicVolumeCeiling, useMusicAudioSettings } from "@/lib/music/audio-settings";
import { playMusicOnSpeaker, returnMusicToComputer, stopMusicCasting } from "@/lib/music/player";
import { VoidLyrics } from "./void-lyrics";
import { useEffect, useState } from "react";
import {
  Heart, Headphones, ListMusic, Maximize2, Minimize2, Pause, Play,
  Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX,
} from "lucide-react";
import { Poster } from "@/components/poster";
import { useT } from "@/lib/i18n";
import {
  nextMusic, playMusic, previousMusic, seekMusic, setMusicVolume,
  toggleMusicLiked, toggleMusicPlayback, useMusicPlayer,
} from "@/lib/music/player";
import {
  cycleMusicRepeat, musicUpcoming, toggleMusicShuffle, useMusicTransport,
} from "@/lib/music/transport";
import { useView } from "@/lib/view";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const value = Math.floor(seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/**
 * VOID's own listening surface. This is not the legacy dock in another wrapper:
 * normal playback occupies a dedicated right-side workspace with a real queue.
 * On other categories it condenses into an independent floating controller.
 */
export function VoidListeningDeck() {
  const t = useT();
  const state = useMusicPlayer();
  const transport = useMusicTransport();
  const { topKind, setView } = useView();
  const [large, setLarge] = useState(false);
  useMusicAudioSettings();
  const [panel, setPanel] = useState<"queue" | "lyrics" | "speakers" | "audio">("queue");
  const [sourceOpen, setSourceOpen] = useState(false);
  useEffect(() => {
    const recover = () => { setSourceOpen(true); setLarge(true); };
    window.addEventListener("harbor:music-playback-source-required", recover);
    return () => window.removeEventListener("harbor:music-playback-source-required", recover);
  }, []);
  const [mutedVolume, setMutedVolume] = useState(0.8);
  const inMusic = topKind === "music";
  const track = state.current;
  if (!inMusic && !track) return null;

  const playing = state.phase === "playing";
  const liked = !!track && state.likedIds.includes(track.id);
  const duration = Math.max(0, state.duration || track?.durationSeconds || 0);
  const position = Math.min(duration, Math.max(0, state.currentTime));
  const upcoming = musicUpcoming(state.queue, state.queueIndex, 5, false);
  const imageSeed = track ? `track:${track.connectorId ?? ""}:${track.sourceId ?? track.id}` : "void-empty";

  const toggleMute = () => {
    if (state.volume > 0) {
      setMutedVolume(state.volume);
      setMusicVolume(0);
    } else {
      setMusicVolume(mutedVolume > 0 ? mutedVolume : 0.7);
    }
  };

  if (!inMusic && !large) {
    return (
      <aside className="void-listening-float" data-void-listening-float aria-label={t("music.player")}>
        <button type="button" className="void-listening-float-art" onClick={() => setView("music")} aria-label={t("nav.music")}>
          <Poster src={track?.artwork ?? ""} seed={imageSeed} ratio="square" className="w-full [--poster-radius:8px]" />
        </button>
        <button type="button" className="void-listening-float-copy" onClick={() => setView("music")}>
          <strong>{track?.title}</strong><span>{track?.artist}</span>
        </button>
        <button type="button" className="void-listening-float-ctl" aria-label={playing ? t("music.pause") : t("music.play")} onClick={toggleMusicPlayback}>
          {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </button>
        <button type="button" className="void-listening-float-ctl" aria-label={t("music.next")} onClick={() => nextMusic()}><SkipForward size={18} /></button>
        <button type="button" className="void-listening-float-ctl" aria-label={t("music.now.expand")} onClick={() => setLarge(true)}><Maximize2 size={18} /></button>
      </aside>
    );
  }

  return (
    <aside
      className={`void-listening-deck ${large ? "void-listening-deck-large" : ""}`}
      data-void-listening-deck
      aria-label={t("music.player")}
    >
      <div className="void-listening-deck-head">
        <div><span className="void-listening-signal" aria-hidden="true" /> <span>NOW PLAYING</span></div>
        <button type="button" onClick={() => setLarge((value) => !value)} aria-label={large ? t("music.now.collapse") : t("music.now.expand")}>
          {large ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
      </div>

      {track ? (
        <>
          <div className="void-listening-cover">
            <Poster src={track.artwork} seed={imageSeed} ratio="square" className="w-full [--poster-radius:0px]" />
          </div>
          <div className="void-listening-credit">
            <span className="void-listening-kicker">LISTENING TO</span>
            <h2 title={track.title}>{track.title}</h2>
            <p title={track.artist}>{track.artist}</p>
            {track.album && <small title={track.album}>{track.album}</small>}
          </div>
          <div className="void-listening-timeline">
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={1}
              value={position}
              onChange={(event) => seekMusic(Number(event.currentTarget.value))}
              aria-label={t("music.transport.seek")}
              style={{ "--void-seek-progress": `${duration > 0 ? (position / duration) * 100 : 0}%` } as React.CSSProperties}
            />
            <div className="void-listening-times"><time>{formatTime(position)}</time><time>{formatTime(duration)}</time></div>
          </div>
          <div className="void-listening-transport">
            <button type="button" data-on={transport.shuffle || undefined} aria-pressed={transport.shuffle} aria-label={t("music.transport.shuffle")} onClick={toggleMusicShuffle}><Shuffle size={20} /></button>
            <button type="button" aria-label={t("music.previous")} onClick={() => previousMusic()}><SkipBack size={23} fill="currentColor" /></button>
            <button type="button" className="void-listening-primary" aria-label={playing ? t("music.pause") : t("music.play")} onClick={toggleMusicPlayback}>{playing ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}</button>
            <button type="button" aria-label={t("music.next")} onClick={() => nextMusic()}><SkipForward size={23} fill="currentColor" /></button>
            <button type="button" data-on={transport.repeat !== "off" || undefined} aria-pressed={transport.repeat !== "off"} aria-label={t("music.transport.repeat")} onClick={cycleMusicRepeat}>{transport.repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}</button>
          </div>
          <div className="void-listening-extras">
            <button
              type="button"
              aria-label={t(liked ? "music.unsaveTrack" : "music.saveTrack")}
              aria-pressed={liked}
              data-on={liked || undefined}
              onClick={() => toggleMusicLiked()}
            ><Heart size={20} fill={liked ? "currentColor" : "none"} /></button>
            <div className="void-listening-volume">
              <button type="button" aria-label={state.volume === 0 ? "Unmute" : "Mute"} onClick={toggleMute}>{state.volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
              <input type="range" min={0} max={musicVolumeCeiling(track.connectorId)} step={0.01} value={state.volume} aria-label="Volume" onChange={(event) => setMusicVolume(Number(event.currentTarget.value))} />
            </div>
          </div>
          <div className="void-listening-tools">
            {(["queue", "lyrics", "speakers", "audio"] as const).map((id) =>
              <button key={id} type="button" aria-pressed={panel === id} onClick={() => setPanel(id)}>{t(({ queue: "Queue", lyrics: "Lyrics", speakers: "music.cast.title", audio: "Audio" })[id])}</button>
            )}
            <button type="button" onClick={() => setSourceOpen(true)}>{t("Sources")}</button>
          </div>
          {sourceOpen && <MusicSourcePicker key={imageSeed} request={{track, queue: state.queue, forceChoice: true, failure: state.error ?? undefined, failedTrack: state.error ? track : undefined}}
            onClose={() => setSourceOpen(false)} onStarting={() => setSourceOpen(false)}
            onConnect={() => { setSourceOpen(false); setView("music"); requestMusicConnection("spotify"); }} />}
          {panel === "audio" && <MusicAudioSettings connectorId={track.connectorId} onBack={() => setPanel("queue")} />}
          {panel === "lyrics" && <VoidLyrics track={track} key={imageSeed} seconds={position} />}
          {panel === "speakers" && <MusicSpeakers track={track} positionSec={position} onLoad={playMusicOnSpeaker} onStop={stopMusicCasting} onReturn={returnMusicToComputer} onClose={() => setPanel("queue")} />}
          {panel === "queue" && <section className="void-listening-up-next" aria-label={t("music.transport.openQueue")}>
            <header><ListMusic size={17} /><h3>UP NEXT</h3><span>{upcoming.length}</span></header>
            <div className="void-listening-up-next-items">
              {upcoming.length ? upcoming.map((next, index) => (
                <button
                  type="button"
                  key={`${next.connectorId ?? ""}:${next.id}:${index}`}
                  onClick={() => void playMusic(next, state.queue)}
                  className="void-listening-next-item"
                  title={next.title}
                >
                  <span className="void-listening-next-art"><Poster src={next.artwork} seed={`track:${next.id}`} ratio="square" className="w-full [--poster-radius:4px]" /></span>
                  <span><strong>{next.title}</strong><small>{next.artist}</small></span>
                  <span className="void-listening-next-duration">{next.durationLabel}</span>
                </button>
              )) : <p className="void-listening-empty-queue">Your queue will appear here.</p>}
            </div>
          </section>}
          {state.error && <p className="void-listening-error" role="alert">{state.error}</p>}
        </>
      ) : (
        <div className="void-listening-start">
          <Headphones size={44} strokeWidth={1.25} />
          <h2>The room is yours.</h2>
          <p>Choose a track. Your music, controls and upcoming queue live here.</p>
        </div>
      )}
    </aside>
  );
}
