import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, Heart, Headphones, LibraryBig, ListMusic,
  Music2, Pause, Play, Search, Settings2, Shuffle,
} from "lucide-react";
import { Poster } from "@/components/poster";
import {
  MusicConnectionsProvider, MusicConnections, useMusicConnections,
} from "@/components/music/music-connections";
import { MusicPlaylistPickerProvider, useMusicPlaylistPicker } from "@/components/music/music-playlist-picker";
import {
  MusicSourcePickerProvider, useMusicSourcePicker,
} from "@/components/music/music-source-picker";
import {
  albumTracks, artistRows, artistTop, catalogPlaylistTracks, searchTyped, stationTracks,
} from "@/lib/music/catalog";
import { enqueueMusic, toggleMusicPlayback } from "@/lib/music/player";
import { useMusicPlayback } from "@/lib/music/use-music-playback";
import type { MusicCatalogItem, MusicCatalogRow, MusicSearchResults, MusicTrack } from "@/lib/music/types";
import { useMusicData } from "@/views/music/use-music-data";
import "./void-studio-music.css";

type Room = "now" | "explore" | "library" | "search";
type Filter = "all" | "tracks" | "albums" | "artists" | "playlists";

function itemTitle(item: MusicCatalogItem) {
  switch (item.kind) {
    case "track": case "album": return item.title;
    case "artist": case "playlist": case "station": return item.kind === "artist" ? item.name : item.name;
  }
}
function itemArtwork(item: MusicCatalogItem): string {
  const artwork = item.artwork;
  return Array.isArray(artwork) ? artwork[0] ?? "" : artwork ?? "";
}
function itemSubtitle(item: MusicCatalogItem): string {
  switch (item.kind) {
    case "album": case "track": return item.artist;
    case "artist": return item.subtitle ?? "Artist";
    case "playlist": return item.subtitle ?? "Playlist";
    case "station": return item.subtitle ?? "Radio";
  }
}
function keyOf(item: MusicCatalogItem) {
  return `${item.kind}:${item.connectorId ?? "music"}:${item.id}`;
}

function Cover({ item, className = "" }: { item: MusicCatalogItem; className?: string }) {
  const art = itemArtwork(item);
  if (!art) return <div className={`void-studio-music-no-art ${className}`} aria-hidden="true"><Music2 size={34} strokeWidth={1.5} /></div>;
  return (
    <span className={`void-studio-music-art ${className}`}>
      <Poster src={art} seed={keyOf(item)} ratio="square" className="w-full [--poster-radius:0px]" />
    </span>
  );
}

function StudioTrack({
  track, index, onPlay, onQueue, onPlaylist, onArtist,
}: {
  track: MusicTrack;
  index: number;
  onPlay: () => void;
  onQueue: () => void;
  onPlaylist: () => void;
  onArtist: () => void;
}) {
  return (
    <article className="void-studio-track">
      <span className="void-studio-track-number">{String(index + 1).padStart(2, "0")}</span>
      <button type="button" className="void-studio-track-cover" onClick={onPlay} aria-label={`Play ${track.title}`}>
        <Cover item={{ ...track, kind: "track" }} />
        <span className="void-studio-track-play" aria-hidden="true"><Play size={17} /></span>
      </button>
      <div className="void-studio-track-copy">
        <button type="button" className="void-studio-track-title" title={track.title} onClick={onPlay}>{track.title}</button>
        <button type="button" className="void-studio-track-subtitle" title={track.artist} onClick={onArtist}>{track.artist}</button>
      </div>
      <span className="void-studio-track-duration">{track.durationLabel}</span>
      <button className="void-studio-track-action" type="button" onClick={onQueue} title="Add to queue" aria-label="Add to queue"><ListMusic size={18} /></button>
      <button className="void-studio-track-action" type="button" onClick={onPlaylist} title="Add to playlist" aria-label="Add to playlist"><Heart size={18} /></button>
    </article>
  );
}

function MusicStudioBody() {
  const player = useMusicPlayback();
  const data = useMusicData(player.recents);
  const { openSourcePicker } = useMusicSourcePicker();
  const { openPlaylistPicker } = useMusicPlaylistPicker();
  const { request, openConnections, closeConnections, connections, status: connectionStatus } = useMusicConnections();
  const [room, setRoom] = useState<Room>("now");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<MusicSearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [detail, setDetail] = useState<MusicCatalogItem | null>(null);
  const [detailTracks, setDetailTracks] = useState<MusicTrack[]>([]);
  const [detailRows, setDetailRows] = useState<MusicCatalogRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailRun = useRef(0);
  const searchRun = useRef(0);

  useEffect(() => () => {
    detailRun.current += 1;
    searchRun.current += 1;
  }, []);

  const play = useCallback((track: MusicTrack, queue: MusicTrack[] = [track]) => {
    if (player.current?.id === track.id && player.current?.connectorId === track.connectorId) {
      toggleMusicPlayback();
    } else {
      openSourcePicker(track, queue);
    }
  }, [openSourcePicker, player.current]);

  const openItem = useCallback((item: MusicCatalogItem, directTracks?: MusicTrack[]) => {
    if (item.kind === "track") {
      play(item, [item]);
      return;
    }
    const run = ++detailRun.current;
    setDetail(item);
    setDetailTracks(directTracks ?? []);
    setDetailRows([]);
    setDetailError("");
    setDetailLoading(directTracks === undefined);
    if (directTracks) return;
    const fetch = async () => {
      if (item.kind === "album") return { tracks: await albumTracks(item), rows: [] as MusicCatalogRow[] };
      if (item.kind === "artist") {
        const [tracks, rows] = await Promise.all([artistTop(item), artistRows(item)]);
        return { tracks, rows };
      }
      if (item.kind === "playlist") return { tracks: await catalogPlaylistTracks(item), rows: [] as MusicCatalogRow[] };
      return { tracks: await stationTracks(item), rows: [] as MusicCatalogRow[] };
    };
    void fetch().then(({ tracks, rows }) => {
      if (detailRun.current !== run) return;
      setDetailTracks(tracks);
      setDetailRows(rows);
      setDetailLoading(false);
    }).catch((cause: unknown) => {
      if (detailRun.current !== run) return;
      setDetailLoading(false);
      setDetailError(String(cause));
    });
  }, [play]);

  const goRoom = (next: Room) => {
    detailRun.current += 1;
    setDetail(null);
    setRoom(next);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const run = ++searchRun.current;
    setRoom("search");
    setDetail(null);
    setFilter("all");
    setSearching(true);
    setSearchError("");
    void searchTyped(value, 30, source || undefined)
      .then((next) => {
        if (searchRun.current !== run) return;
        setResults(next);
        setSearching(false);
      })
      .catch((cause: unknown) => {
        if (searchRun.current !== run) return;
        setSearchError(String(cause));
        setSearching(false);
      });
  };

  const choices = connections.filter((connector) => connector.status === "connected" && connector.capabilities.includes("search"));
  const catalog = data.homeRows.flatMap((row) => row.items);
  const featured = player.current ?? player.recents[0] ?? data.fresh[0] ??
    catalog.find((item): item is Extract<MusicCatalogItem, { kind: "track" }> => item.kind === "track");
  const freshPicks = catalog.filter((item) => item.kind === "album" || item.kind === "playlist" || item.kind === "artist").slice(0, 8);
  const libraryTracks = [...player.likedTracks, ...player.recents.filter((track) => !player.likedTracks.some((like) => like.id === track.id))].slice(0, 28);
  const allResults: MusicCatalogItem[] = results ? [
    ...results.tracks.map((track) => ({ ...track, kind: "track" as const })),
    ...results.albums.map((album) => ({ ...album, kind: "album" as const })),
    ...results.artists.map((artist) => ({ ...artist, kind: "artist" as const })),
    ...results.playlists.map((playlist) => ({ ...playlist, kind: "playlist" as const })),
  ] : [];
  const scopedResults = allResults.filter((item) => filter === "all" || filter === `${item.kind}s`);
  const showTracks = (tracks: MusicTrack[]) => (
    <div className="void-studio-track-list">
      {tracks.map((track, index) => (
        <StudioTrack
          key={`${track.connectorId ?? ""}:${track.sourceId ?? track.id}:${index}`}
          track={track}
          index={index}
          onPlay={() => play(track, tracks)}
          onQueue={() => enqueueMusic(track)}
          onPlaylist={() => openPlaylistPicker(track)}
          onArtist={() => {
            setRoom("search"); setQuery(track.artist);
            setFilter("all");
            setSearchError("");
            const run = ++searchRun.current;
            setSearching(true);
            void searchTyped(track.artist).then((result) => {
              if (run === searchRun.current) { setResults(result); setSearching(false); }
            }).catch((cause: unknown) => { if (run === searchRun.current) { setSearchError(String(cause)); setSearching(false); } });
          }}
        />
      ))}
    </div>
  );

  return (
    <main data-void-studio-music className="void-studio-music">
      <aside className="void-studio-music-context" aria-label="Music workspace navigation">
        <div className="void-studio-music-context-heading">
          <Headphones size={23} strokeWidth={1.8} /><span>MUSIC</span>
        </div>
        <nav>
          {([
            ["now", "Listen now", Headphones],
            ["explore", "Explore", Shuffle],
            ["library", "Your library", LibraryBig],
            ["search", "Find music", Search],
          ] as const).map(([id, label, Icon]) => (
            <button type="button" key={id} data-active={room === id && !detail ? "" : undefined} onClick={() => goRoom(id)}>
              <Icon size={21} strokeWidth={1.65} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="void-studio-music-context-bottom">
          <span>YOUR SOURCES</span>
          <p>{connectionStatus === "loading" ? "Checking connections" : `${choices.length} searchable sources`}</p>
          <button type="button" onClick={() => openConnections()}><Settings2 size={17} /> Manage music sources</button>
        </div>
      </aside>
      <section className="void-studio-music-canvas">
        {request ? (
          <div className="void-studio-music-connections">
            <MusicConnections focusId={request.focusId} onClose={closeConnections} />
          </div>
        ) : detail ? (
          <>
            <button className="void-studio-music-back" type="button" onClick={() => { detailRun.current++; setDetail(null); }}>
              <ArrowLeft size={18} /> Back to music
            </button>
            <section className="void-studio-music-detail">
              <div className="void-studio-music-detail-art"><Cover item={detail} /></div>
              <div className="void-studio-music-detail-copy">
                <span className="void-studio-overline">{detail.kind.toUpperCase()}</span>
                <h1>{itemTitle(detail)}</h1>
                <p>{itemSubtitle(detail)}</p>
                {detailTracks.length > 0 && <small>{detailTracks.length} tracks</small>}
                <button type="button" className="void-studio-music-cta" onClick={() => detailTracks[0] && play(detailTracks[0], detailTracks)} disabled={!detailTracks.length}>
                  <Play size={22} fill="currentColor" /> Play collection
                </button>
              </div>
            </section>
            {detailError && <p className="void-studio-message" role="alert">{detailError}</p>}
            {detailLoading ? <p className="void-studio-message">Loading music…</p> : detailTracks.length ? (
              <section className="void-studio-music-track-section">
                <div className="void-studio-section-heading"><h2>The tracklist</h2><span>{detailTracks.length}</span></div>
                {showTracks(detailTracks)}
              </section>
            ) : null}
            {detailRows.length > 0 && (
              <section className="void-studio-music-track-section">
                <div className="void-studio-section-heading"><h2>More from this artist</h2></div>
                <div className="void-studio-music-art-grid">
                  {detailRows.flatMap((row) => row.items).slice(0, 8).map((item) => (
                    <button type="button" key={keyOf(item)} className="void-studio-music-art-card" onClick={() => openItem(item)}>
                      <Cover item={item}/><strong>{itemTitle(item)}</strong><span>{itemSubtitle(item)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : room === "search" ? (
          <section className="void-studio-music-search">
            <span className="void-studio-overline">DISCOVER / MUSIC</span>
            <h1>Find your next obsession.</h1>
            <form onSubmit={submitSearch} role="search" className="void-studio-music-search-form">
              <Search size={24} strokeWidth={1.65} aria-hidden="true" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Artists, albums, tracks…" aria-label="Music search" />
              <select value={source} aria-label="Music source" onChange={(event) => setSource(event.currentTarget.value)}>
                <option value="">All sources</option>
                {choices.map((choice) => <option value={choice.id} key={choice.id}>{choice.name}</option>)}
              </select>
              <button type="submit" disabled={!query.trim()}>Search</button>
            </form>
            {searchError && <p className="void-studio-message" role="alert">{searchError}</p>}
            {searching && <p className="void-studio-message" role="status">Searching across your sources…</p>}
            {results && !searching && (
              <>
                <div className="void-studio-music-filters" aria-label="Result categories">
                  {(["all", "tracks", "artists", "albums", "playlists"] as Filter[]).map((kind) => (
                    <button type="button" key={kind} data-active={filter === kind || undefined} onClick={() => setFilter(kind)}>
                      {kind[0].toUpperCase() + kind.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="void-studio-section-heading"><h2>Results</h2><span>{scopedResults.length}</span></div>
                {scopedResults.length ? (
                  <>
                    {scopedResults.filter((item): item is Extract<MusicCatalogItem, { kind: "track" }> => item.kind === "track").length > 0 &&
                      showTracks(scopedResults.filter((item): item is Extract<MusicCatalogItem, { kind: "track" }> => item.kind === "track"))}
                    <div className="void-studio-music-art-grid">
                      {scopedResults.filter((item) => item.kind !== "track").map((item) => (
                        <button type="button" key={keyOf(item)} className="void-studio-music-art-card" onClick={() => openItem(item)}>
                          <Cover item={item} /><strong>{itemTitle(item)}</strong><span>{itemSubtitle(item)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : <p className="void-studio-message">No matches for this search.</p>}
              </>
            )}
          </section>
        ) : room === "library" ? (
          <section className="void-studio-music-library">
            <span className="void-studio-overline">COLLECTION / PERSONAL</span>
            <h1>Your library.</h1>
            <p className="void-studio-room-intro">The records and tracks you return to, presented as a place rather than a database.</p>
            {data.library && data.library.playlists.length > 0 && (
              <section className="void-studio-music-track-section">
                <div className="void-studio-section-heading"><h2>Playlists</h2><span>{data.library.playlists.length}</span></div>
                <div className="void-studio-music-art-grid">
                  {data.library.playlists.map((playlist) => {
                    const item: MusicCatalogItem = {
                      kind: "playlist", id: playlist.id, connectorId: "local",
                      name: playlist.name, artwork: playlist.tracks.slice(0, 4).map((track) => track.artwork),
                      trackCount: playlist.tracks.length,
                    };
                    return <button type="button" key={playlist.id} className="void-studio-music-art-card" onClick={() => openItem(item, playlist.tracks)}>
                      <Cover item={item} /><strong>{playlist.name}</strong><span>{playlist.tracks.length} tracks</span>
                    </button>;
                  })}
                </div>
              </section>
            )}
            <section className="void-studio-music-track-section">
              <div className="void-studio-section-heading"><h2>Tracks in rotation</h2><span>{libraryTracks.length}</span></div>
              {libraryTracks.length ? showTracks(libraryTracks) : <p className="void-studio-message">Start listening to build your library.</p>}
            </section>
          </section>
        ) : (
          <>
            <section className="void-studio-music-story">
              {featured && <div className="void-studio-music-story-art"><Cover item={{ ...featured, kind: "track" }} /></div>}
              <div className="void-studio-music-story-copy">
                <span className="void-studio-overline">{room === "explore" ? "UNEXPECTED FINDS" : "YOUR LISTENING ROOM"}</span>
                <h1>{featured ? featured.title : "Music has a place here."}</h1>
                <p>{featured ? featured.artist : "Every source. Every record. A different way to listen."}</p>
                <div className="void-studio-music-story-actions">
                  <button type="button" className="void-studio-music-cta" onClick={() => featured ? play(featured) : openConnections()}>
                    {player.current?.id === featured?.id && player.phase === "playing" ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                    {featured ? "Play this" : "Connect music"}
                  </button>
                  <button type="button" className="void-studio-music-ghost" onClick={() => goRoom("explore")}>Explore music <ArrowRight size={19}/></button>
                </div>
              </div>
            </section>
            <section className="void-studio-music-track-section">
              <div className="void-studio-section-heading">
                <h2>{room === "explore" ? "Picked for discovery" : "Recently in rotation"}</h2>
                <button type="button" onClick={() => goRoom(room === "explore" ? "search" : "library")}>See all <ArrowRight size={18}/></button>
              </div>
              {player.recents.length > 0 ? showTracks(player.recents.slice(0, 6)) : (
                <p className="void-studio-message">Your listening history will show up here.</p>
              )}
            </section>
            {freshPicks.length > 0 && (
              <section className="void-studio-music-track-section">
                <div className="void-studio-section-heading"><h2>Elsewhere in music</h2><span>SELECTED</span></div>
                <div className="void-studio-music-art-grid">
                  {freshPicks.map((item) => (
                    <button type="button" className="void-studio-music-art-card" key={keyOf(item)} onClick={() => openItem(item)}>
                      <Cover item={item}/><strong>{itemTitle(item)}</strong><span>{itemSubtitle(item)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export function VoidStudioMusic({ active }: { active: boolean }) {
  return (
    <MusicConnectionsProvider active={active}>
      <MusicSourcePickerProvider active={active}>
        <MusicPlaylistPickerProvider active={active}>
          <MusicStudioBody />
        </MusicPlaylistPickerProvider>
      </MusicSourcePickerProvider>
    </MusicConnectionsProvider>
  );
}
