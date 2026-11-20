import { registerEvictable } from "@/lib/maintenance";
import { registerCache } from "@/lib/memory-profiler";
import { reusableAnimeBackdrop } from "./anime-art-quality";
import type { AnimeArtworkKind } from "./anime-format";

export type AnimeArt = { bg?: string; logo?: string; backdrops?: string[] };
type Entry = AnimeArt & { t: number; kind?: AnimeArtworkKind; backdropVersion?: number };

const KEY = "harbor.anime.art.v2";
const MOVIE_BACKDROP_VERSION = 1;
const CAP = 1000;
const TTL = 60 * 24 * 60 * 60 * 1000;
const mem = new Map<string, Entry>();
let loaded = false;

registerCache("anime:art", () => mem.size);
registerEvictable("anime-art", (aggressive) => {
  if (aggressive) {
    mem.clear();
    loaded = false;
  }
});

function ensure(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as { map?: Record<string, Entry> };
    const now = Date.now();
    for (const [k, e] of Object.entries(raw.map ?? {})) {
      // Older builds stored the 1900x400 AniList banner as hero art; drop it on read so the
      // surfaces that resolve their own artwork can replace it.
      if (!e || now - e.t >= TTL) continue;
      const needsMovieBackdrop = e.kind === "movie" && e.backdropVersion !== MOVIE_BACKDROP_VERSION;
      mem.set(k, { ...e, bg: needsMovieBackdrop ? undefined : reusableAnimeBackdrop(e.bg) });
    }
  } catch {
    /* ignore */
  }
}

function persist(): void {
  const entries = [...mem.entries()];
  const trimmed =
    entries.length > CAP ? entries.sort((a, b) => b[1].t - a[1].t).slice(0, CAP) : entries;
  try {
    localStorage.setItem(KEY, JSON.stringify({ map: Object.fromEntries(trimmed) }));
  } catch {
    /* ignore */
  }
}

export function peekAnimeArt(
  key: string | undefined | null,
  kind: AnimeArtworkKind,
): AnimeArt | undefined {
  if (!key) return undefined;
  ensure();
  const entry = mem.get(key);
  // Legacy records lack provenance and may hold the parent series' art for a film.
  return (entry?.kind ?? "tv") === kind ? entry : undefined;
}

export function saveAnimeArt(
  key: string | undefined | null,
  kind: AnimeArtworkKind,
  art: AnimeArt,
): void {
  if (!key || (!art.bg && !art.logo && !art.backdrops?.length)) return;
  const prev = peekAnimeArt(key, kind);
  const next: Entry = {
    kind,
    backdropVersion: kind === "movie" ? MOVIE_BACKDROP_VERSION : undefined,
    bg: reusableAnimeBackdrop(art.bg) ?? reusableAnimeBackdrop(prev?.bg),
    logo: art.logo ?? prev?.logo,
    backdrops: art.backdrops?.length ? art.backdrops : prev?.backdrops,
    t: Date.now(),
  };
  if (prev && next.bg === prev.bg && next.logo === prev.logo && next.backdrops === prev.backdrops)
    return;
  mem.set(key, next);
  persist();
}
