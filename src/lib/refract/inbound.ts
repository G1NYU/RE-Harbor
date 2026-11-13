import { activeProfileIsPrimary } from "@/lib/active-profile-id";
import { applyRemoteWatched, manualWatchedState } from "@/lib/manual-watched";
import { isMovieWatchedLocal, setMovieWatchedLocal } from "@/lib/movie-watched";
import {
  getRefractKey,
  getRefractProfile,
  getRefractSyncHead,
  listRefractChanges,
  listRefractHistory,
  RefractApiError,
  refractEnabled,
  type RefractChange,
  type RefractEpisodeWatch,
  type RefractMoviePlay,
  type RefractWork,
} from "./client";

type Phase = "episodes" | "movies" | "changes" | "live";
type State = {
  account: string;
  phase: Phase;
  cursor: string | null;
  head: string;
  imported: number;
  lastSync: number;
  nextAt: number;
  error: string;
};

const STORE_KEY = "harbor.refract.inbound.v1";
const EVENT = "harbor:refract-sync-changed";
const MAX_PAGES_PER_PASS = 12;
let running = false;
let generation = 0;

function read(): State | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || "null") as State | null;
    return parsed && typeof parsed.account === "string" && typeof parsed.phase === "string"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function write(state: State): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(EVENT));
}

export function refractInboundStatus() {
  const state = read();
  return {
    imported: state?.imported ?? 0,
    active: state?.phase === "live",
    phase: state?.phase ?? "not started",
    error: state?.error || "",
    lastSync: state?.lastSync ?? 0,
  };
}

export function resetRefractInboundSync(): void {
  generation++;
  localStorage.removeItem(STORE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Refract uses TMDB episode numbering. Never apply a Refract anime watch to an
 * anime-native Kitsu/MAL episode number, or to an unverified title-name match.
 * Ordinary show IMDb and TMDB IDs and TMDB anime show IDs are safe local aliases.
 */
function harborIds(work: RefractWork, kind: "show" | "movie"): string[] {
  if (work.type !== kind) return [];
  const ids: string[] = [];
  if (!work.is_anime && typeof work.ids?.imdb === "string" && /^tt\d+$/i.test(work.ids.imdb))
    ids.push(work.ids.imdb);
  if (typeof work.ids?.tmdb === "number" && Number.isSafeInteger(work.ids.tmdb) && work.ids.tmdb > 0)
    ids.push(`tmdb:${kind === "show" ? "tv" : "movie"}:${work.ids.tmdb}`);
  // Anime movies have no episode-number ambiguity; an IMDb movie ID is also safe.
  if (kind === "movie" && work.is_anime && typeof work.ids?.imdb === "string" && /^tt\d+$/i.test(work.ids.imdb))
    ids.push(work.ids.imdb);
  return [...new Set(ids)];
}

function applyEpisodes(entries: RefractEpisodeWatch[], valid: () => boolean): number {
  const additions = new Map<string, Map<string, { season: number; episode: number }>>();
  let accepted = 0;
  for (const entry of entries) {
    if (!valid()) return accepted;
    const { season, number } = entry.episode || {};
    if (!Number.isInteger(season) || season < 0 || !Number.isInteger(number) || number < 1)
      continue;
    const ids = harborIds(entry.show, "show");
    if (!ids.length) continue;
    for (const id of ids) {
      if (manualWatchedState(id, season, number) !== undefined) continue;
      const list = additions.get(id) || new Map<string, { season: number; episode: number }>();
      list.set(`${season}:${number}`, { season, episode: number });
      additions.set(id, list);
    }
    accepted++;
  }
  for (const [id, episodes] of additions) {
    if (!valid()) break;
    applyRemoteWatched(id, [...episodes.values()], []);
  }
  return accepted;
}

function applyMovies(entries: RefractMoviePlay[], valid: () => boolean): number {
  const ids = new Set<string>();
  let accepted = 0;
  for (const play of entries) {
    if (!valid()) return accepted;
    const keys = harborIds(play.movie, "movie");
    if (!keys.length) continue;
    keys.forEach((key) => ids.add(key));
    accepted++;
  }
  for (const id of ids) {
    if (!valid()) break;
    if (!isMovieWatchedLocal(id)) setMovieWatchedLocal(id, true);
  }
  return accepted;
}

/** Deletions are deliberately non-destructive: another tracker or a separate
 * Refract movie play may still own the watched state inside Harbor. */
function applyChanges(changes: RefractChange[], valid: () => boolean): number {
  const episodes: RefractEpisodeWatch[] = [];
  const movies: RefractMoviePlay[] = [];
  for (const change of changes) {
    if (change.action !== "upsert" || !change.item || typeof change.item !== "object")
      continue;
    const item = change.item as Record<string, unknown>;
    if (change.type === "episode_watch" && item.show && item.episode) {
      episodes.push(item as RefractEpisodeWatch);
    } else if (change.type === "movie_play" && item.movie) {
      movies.push(item as RefractMoviePlay);
    }
  }
  return applyEpisodes(episodes, valid) + applyMovies(movies, valid);
}

/** Read without changing titles, statuses, watchlists, or cloud/Stremio history. */
export async function pollRefractInbound(): Promise<void> {
  if (running || !refractEnabled() || !activeProfileIsPrimary()) return;
  const key = getRefractKey();
  if (!key) return;
  const epoch = generation;
  const valid = () =>
    generation === epoch &&
    getRefractKey() === key &&
    refractEnabled() &&
    activeProfileIsPrimary();
  const previous = read();
  if (previous && previous.nextAt > Date.now()) return;
  running = true;
  let state = previous;
  try {
    const profile = await getRefractProfile(key);
    if (!valid()) return;
    if (!profile?.id) throw new Error("Refract did not identify the connected account");
    if (!state || state.account !== profile.id) {
      // A key change must never reuse the previous member's cursor.
      const head = await getRefractSyncHead(key);
      if (!valid()) return;
      state = {
        account: profile.id,
        phase: "episodes",
        cursor: null,
        head,
        imported: 0,
        lastSync: 0,
        nextAt: 0,
        error: "",
      };
      write(state);
    }
    for (let n = 0; n < MAX_PAGES_PER_PASS && valid(); n++) {
      if (state.phase === "episodes" || state.phase === "movies") {
        const phase = state.phase;
        const page = await listRefractHistory<RefractEpisodeWatch | RefractMoviePlay>(
          key,
          phase,
          state.cursor,
        );
        if (!valid()) return;
        if (!Array.isArray(page.data) || typeof page.has_more !== "boolean" ||
            (page.has_more && !page.next_cursor))
          throw new Error("Refract returned an incomplete history page");
        const count = phase === "episodes"
          ? applyEpisodes(page.data as RefractEpisodeWatch[], valid)
          : applyMovies(page.data as RefractMoviePlay[], valid);
        if (!valid()) return;
        state.imported += count;
        state.cursor = page.has_more ? page.next_cursor : null;
        if (!page.has_more) state.phase = phase === "episodes" ? "movies" : "changes";
        if (state.phase === "changes") state.cursor = state.head;
        state.error = "";
        write(state);
        continue;
      }
      if (state.phase === "changes" || state.phase === "live") {
        const page = await listRefractChanges(key, state.cursor || state.head);
        if (!valid()) return;
        if (!Array.isArray(page.data) || !page.next_cursor ||
            typeof page.has_more !== "boolean")
          throw new Error("Refract returned an incomplete change page");
        state.imported += applyChanges(page.data, valid);
        if (!valid()) return;
        // Cursor persistence follows local mutation, never precedes it.
        state.cursor = page.next_cursor;
        state.phase = page.has_more ? "changes" : "live";
        state.error = "";
        state.lastSync = Date.now();
        write(state);
        if (!page.has_more) break;
      }
    }
  } catch (error) {
    if (!valid()) return;
    if (error instanceof RefractApiError && error.status === 410) {
      // Bulk import/retention reset: rescan. Existing local marks are retained.
      localStorage.removeItem(STORE_KEY);
      window.dispatchEvent(new Event(EVENT));
      return;
    }
    if (!state) return;
    const status = error instanceof RefractApiError ? error.status : 0;
    state.error = status === 403
      ? "Refract import needs the history:read permission. Create a key with that scope."
      : status === 401
        ? "Refract rejected the API key; reconnect in settings."
        : error instanceof Error ? error.message : "Refract history import failed";
    state.nextAt = Date.now() + (status === 401 || status === 403
      ? 60 * 60_000
      : Math.max(error instanceof RefractApiError ? error.retryAfterMs : 0, 60_000));
    write(state);
  } finally {
    running = false;
  }
}
