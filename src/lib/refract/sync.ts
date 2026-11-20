import type { WatchEvent } from "@/lib/watch-events";
import { parseRefractHistoryId } from "./identity";
import { activeProfileIsPrimary, activeScopedProfileId } from "@/lib/active-profile-id";
import {
  getRefractKey,
  lookupRefract,
  refractEnabled,
  RefractApiError,
  writeRefractEpisode,
  writeRefractMovie,
} from "./client";

export type RefractHint = {
  externalId?: string | null;
  episodes?: Array<{ season: number; episode: number }>;
  numbering?: "tmdb" | "tvdb" | "absolute";
};

type Job = {
  id: string;
  sourceId: string;
  type: "movie" | "episode";
  season?: number;
  episode?: number;
  numbering?: "tmdb" | "tvdb" | "absolute";
  watchedAt: number;
  requestId: string;
  attempts: number;
  nextAt: number;
};
type Failure = { sourceId: string; season?: number; episode?: number; reason: string };
type Store = {
  pending: Job[];
  recent: Record<string, number>;
  failed: Failure[];
  synced: number;
  message: string;
  epoch: string;
};

const STORE_KEY = "harbor.refract.sync.v1";
const EVENT = "harbor:refract-sync-changed";
const DEDUP_MS = 15 * 60 * 1000;
const DRAIN_LOCK = "harbor.refract.sync.drain.v1";
const MAX_PENDING = 2500;
const QUEUE_FULL = "Refract queue full; unable to save another watch";
let running = false;
let flushRequested = false;
let started = false;

const empty = (): Store => ({
  pending: [],
  recent: {},
  failed: [],
  synced: 0,
  message: "",
  epoch: "initial",
});

/** All shared queue read-modify-writes are serialized across WebView windows. */
function withStoreLock<T>(run: () => T | Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks?.request ? locks.request(STORE_KEY, run) : Promise.resolve(run());
}
function withDrainLock<T>(run: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  return locks?.request ? locks.request(DRAIN_LOCK, run) : run();
}
function hasCrossWindowLocks(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}
function read(): Store {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || "null") as Partial<Store> | null;
    return data && Array.isArray(data.pending)
      ? {
          pending: data.pending,
          recent: data.recent || {},
          failed: Array.isArray(data.failed) ? data.failed : [],
          synced: Number(data.synced || 0),
          message: String(data.message || ""),
          epoch: typeof data.epoch === "string" ? data.epoch : "initial",
        }
      : empty();
  } catch {
    return empty();
  }
}
function save(state: Store): boolean {
  state.recent = Object.fromEntries(
    Object.entries(state.recent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2500),
  );
  state.failed = state.failed.slice(-80);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}
export function subscribeRefractStatus(fn: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORE_KEY) fn();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}
export function refractStatus() {
  const s = read();
  return {
    pending: s.pending.length,
    synced: s.synced,
    failed: s.failed.length,
    message: s.message,
    failureDetails: s.failed.slice(-4),
    failures: s.failed
      .slice(-4)
      .map(
        (f) => `${f.sourceId}${f.season != null ? ` S${f.season}E${f.episode}` : ""}: ${f.reason}`,
      ),
  };
}
export async function resetRefractSync(): Promise<void> {
  await withStoreLock(() => {
    save({ ...empty(), epoch: crypto.randomUUID() });
  });
}
function keyOf(job: Job): string {
  // A distinct movie viewing has a distinct timestamp, even within fifteen minutes.
  return `${job.type}|${job.sourceId}|${job.season ?? ""}|${job.episode ?? ""}|${
    job.type === "movie" ? job.watchedAt : ""
  }`;
}
function appendBatch(s: Store, jobs: Job[]): void {
  const pendingKeys = new Set(s.pending.map(keyOf));
  const now = Date.now();
  const fresh = jobs.filter((job) => {
    const key = keyOf(job);
    if (now - (s.recent[key] || 0) < DEDUP_MS || pendingKeys.has(key)) return false;
    pendingKeys.add(key);
    return true;
  });
  if (fresh.length === 0) return;
  // Never accept only a prefix of a bulk history action.
  if (s.pending.length + fresh.length > MAX_PENDING) {
    const { sourceId, season, episode } = fresh[0];
    s.failed.push({
      sourceId,
      season: jobs.length === 1 ? season : undefined,
      episode: jobs.length === 1 ? episode : undefined,
      reason: QUEUE_FULL,
    });
    s.message = QUEUE_FULL;
    return;
  }
  s.pending.push(...fresh);
}
export function enqueueRefractWatch(event: WatchEvent, hint: RefractHint = {}): void {
  // A personal key must not receive events from a replacement Harbor profile or account.
  if (!refractEnabled() || !activeProfileIsPrimary()) return;
  const ownerKey = getRefractKey();
  const ownerProfile = activeScopedProfileId();
  if (!ownerKey) return;
  const epoch = read().epoch;
  const sourceId = parseRefractHistoryId(
    hint.externalId || "",
    event.type === "movie" ? "movie" : "episode",
  )
    ? hint.externalId!
    : event.id;
  const at = event.at || Date.now();
  const make = (type: Job["type"], season?: number, episode?: number): Job => ({
    id: crypto.randomUUID(),
    sourceId,
    type,
    season,
    episode,
    numbering: hint.numbering,
    watchedAt: at,
    requestId: crypto.randomUUID(),
    attempts: 0,
    nextAt: Date.now(),
  });
  const jobs: Job[] = [];
  if (event.type === "movie") jobs.push(make("movie"));
  else {
    // An explicitly supplied but unusable episode list must not fall back to
    // the event's unrelated/native season number.
    const episodes =
      hint.episodes !== undefined
        ? hint.episodes
        : event.season !== undefined && event.episode !== undefined
          ? [{ season: event.season, episode: event.episode }]
          : [];
    for (const ep of episodes) {
      if (
        Number.isInteger(ep.season) &&
        ep.season >= 0 &&
        Number.isInteger(ep.episode) &&
        ep.episode >= 1
      )
        jobs.push(make("episode", ep.season, ep.episode));
    }
  }
  if (jobs.length === 0) return;
  const append = () => {
    if (
      getRefractKey() !== ownerKey ||
      activeScopedProfileId() !== ownerProfile ||
      !refractEnabled() ||
      !activeProfileIsPrimary()
    )
      return false;
    const state = read();
    if (state.epoch !== epoch) return false;
    appendBatch(state, jobs);
    return save(state);
  };
  if (hasCrossWindowLocks()) {
    // A companion window only enqueues; the regular window drains after the
    // cross-window storage event. The write lock protects concurrent enqueues.
    void withStoreLock(append).then((saved) => {
      if (saved) void flushRefractSync();
    });
  } else if (append()) {
    void flushRefractSync();
  }
}

class Unmatched extends Error {}
class Superseded extends Error {}
async function push(key: string, job: Job): Promise<void> {
  const parsed = parseRefractHistoryId(job.sourceId, job.type);
  if (!parsed) throw new Unmatched("No verified IMDb/TMDB/TVDB identity");
  const found = await lookupRefract(
    key,
    parsed.type,
    parsed.id,
    job.type,
    job.season,
    job.episode,
    job.numbering,
  );
  if (
    getRefractKey() !== key ||
    !refractEnabled() ||
    !activeProfileIsPrimary() ||
    !read().pending.some((pending) => pending.id === job.id)
  )
    throw new Superseded("Refract sync stopped before write");
  if (job.type === "movie") {
    const movie = found.find((x) => x.ids?.refract != null)?.ids?.refract;
    if (movie == null) throw new Unmatched("Movie not found in Refract");
    await writeRefractMovie(key, movie, job.watchedAt, job.requestId);
    return;
  }
  const episode = found.find(
    (x) => x.show?.ids?.refract != null && x.episode?.season != null && x.episode?.number != null,
  );
  if (
    episode?.show?.ids?.refract == null ||
    episode.episode?.season == null ||
    episode.episode?.number == null
  )
    throw new Unmatched("Episode not found; verify season numbering");
  await writeRefractEpisode(
    key,
    episode.show.ids.refract,
    episode.episode.season,
    episode.episode.number,
    job.watchedAt,
  );
}
export async function flushRefractSync(): Promise<void> {
  if (running) {
    flushRequested = true;
    return;
  }
  if (!refractEnabled() || !activeProfileIsPrimary()) return;
  // Only the regular application window may send HTTP writes. Companion windows
  // enqueue under the shared lock and notify via the storage event.
  if (typeof document !== "undefined" && !started) return;
  const key = getRefractKey();
  if (!key) return;
  running = true;
  try {
    await withDrainLock(async () => {
    for (let count = 0; count < 16; count++) {
      if (getRefractKey() !== key || !refractEnabled() || !activeProfileIsPrimary()) break;
      const s = read();
      const job = s.pending.find((x) => x.nextAt <= Date.now());
      if (!job) break;
      try {
        await push(key, job);
        if (getRefractKey() !== key) break;
        await withStoreLock(() => {
          const current = read();
          // Reset or another window may already have removed this job.
          if (!current.pending.some((x) => x.id === job.id)) return;
          current.pending = current.pending.filter((x) => x.id !== job.id);
          current.recent[keyOf(job)] = Date.now();
          current.synced++;
          current.message = current.failed.some((failure) => failure.reason === QUEUE_FULL)
            ? QUEUE_FULL
            : "Last watched item sent successfully";
          save(current);
        });
      } catch (error) {
        if (error instanceof Superseded || getRefractKey() !== key) break;
        await withStoreLock(() => {
          const current = read();
          const pending = current.pending.find((x) => x.id === job.id);
          if (!pending) return;
        if (
          error instanceof Unmatched ||
          (error instanceof RefractApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            ![401, 403, 409, 429].includes(error.status))
        ) {
          current.pending = current.pending.filter((x) => x.id !== job.id);
          current.failed.push({
            sourceId: job.sourceId,
            season: job.season,
            episode: job.episode,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
          current.message = "Some items could not be matched or sent";
        } else {
          pending.attempts++;
          const status = error instanceof RefractApiError ? error.status : 0;
          pending.nextAt =
            Date.now() +
            (status === 401 || status === 403
              ? 60 * 60_000
              : Math.max(
                  error instanceof RefractApiError ? error.retryAfterMs : 0,
                  Math.min(60 * 60_000, 5000 * 2 ** Math.min(pending.attempts, 8)),
                ));
          current.message =
            status === 401 || status === 403
              ? "Refract denied access; check key and permissions"
              : "Network error; retry scheduled";
        }
          save(current);
        });
      }
    }
    });
  } finally {
    running = false;
    if (flushRequested) {
      flushRequested = false;
      void flushRefractSync();
    }
  }
}
export function retryRefractSync(): void {
  const epoch = read().epoch;
  void withStoreLock(() => {
    const s = read();
    if (s.epoch !== epoch) return;
    for (const job of s.pending) job.nextAt = Date.now();
    save(s);
  }).then(() => void flushRefractSync());
}
export function startRefractSync(): void {
  if (started) {
    void flushRefractSync();
    return;
  }
  started = true;
  const poll = () => void flushRefractSync();
  window.addEventListener("online", poll);
  window.addEventListener("storage", (event: StorageEvent) => {
    if (event.key === STORE_KEY) poll();
  });
  window.setInterval(poll, 60_000);
  poll();
}
