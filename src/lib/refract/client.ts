import { safeFetch } from "@/lib/safe-fetch";
import { readSharedSecret, writeSharedSecret } from "@/lib/secret-store";

const KEY = "harbor.refract.key.v1";
const ENABLED_KEY = "harbor.refract.enabled.v1";
const API = "https://getrefract.app/v1";

export type RefractLookup = {
  ids?: { refract?: string | number };
  show?: { ids?: { refract?: string | number } };
  episode?: { season?: number; number?: number };
};

export class RefractApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfterMs = 0,
  ) {
    super(`Refract HTTP ${status}`);
    this.name = "RefractApiError";
  }
}

export function getRefractKey(): string | null {
  return readSharedSecret(KEY)?.trim() || null;
}
export function saveRefractKey(value: string | null): void {
  writeSharedSecret(KEY, value?.trim() || null);
  window.dispatchEvent(new Event("harbor:refract-auth-changed"));
}
export function refractEnabled(): boolean {
  try {
    return getRefractKey() !== null && localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return false;
  }
}
export function setRefractEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
}
async function request<T>(
  key: string,
  path: string,
  method: "GET" | "PUT" | "POST" = "GET",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const response = await safeFetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": `"${idempotencyKey}"` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
  });
  if (!response.ok) {
    const retry = Number(response.headers.get("Retry-After"));
    throw new RefractApiError(
      response.status,
      Number.isFinite(retry) && retry > 0 ? retry * 1000 : 0,
    );
  }
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  return (raw ? JSON.parse(raw) : undefined) as T;
}
export type RefractProfile = { id: string; username?: string; display_name?: string };
export type RefractIds = {
  refract?: string | null;
  imdb?: string | null;
  tmdb?: number | null;
  tvdb?: number | null;
};
export type RefractWork = {
  ids?: RefractIds;
  type?: "show" | "movie";
  is_anime?: boolean;
};
export type RefractEpisodeRef = { season: number; number: number };
export type RefractEpisodeWatch = { show: RefractWork; episode: RefractEpisodeRef };
export type RefractMoviePlay = { id: string; movie: RefractWork };
export type RefractChange = {
  type: string;
  action: string;
  show?: RefractIds | null;
  movie?: RefractIds | null;
  episode?: RefractEpisodeRef;
  item?: unknown;
};
export type RefractPage<T> = {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export async function getRefractProfile(key: string): Promise<RefractProfile> {
  return request<RefractProfile>(key, "/me");
}
export async function verifyRefractKey(key: string): Promise<string> {
  const profile = await getRefractProfile(key);
  return profile?.username || profile?.display_name || "Connected";
}
export async function getRefractSyncHead(key: string): Promise<string> {
  const result = await request<{ cursor: string }>(key, "/changes/head");
  if (!result?.cursor) throw new Error("Refract did not provide a sync cursor");
  return result.cursor;
}
export async function listRefractHistory<T extends RefractEpisodeWatch | RefractMoviePlay>(
  key: string,
  kind: "episodes" | "movies",
  cursor: string | null,
): Promise<RefractPage<T>> {
  const query = new URLSearchParams({ limit: "200" });
  if (cursor) query.set("cursor", cursor);
  return request<RefractPage<T>>(key, `/history/${kind}?${query}`);
}
export async function listRefractChanges(
  key: string,
  cursor: string,
): Promise<RefractPage<RefractChange>> {
  const query = new URLSearchParams({ cursor, limit: "100" });
  return request<RefractPage<RefractChange>>(key, `/changes?${query}`);
}
export async function lookupRefract(
  key: string,
  idType: "imdb" | "tmdb" | "tvdb",
  externalId: string,
  type: "movie" | "episode",
  season?: number,
  episode?: number,
  numbering?: "tmdb" | "tvdb" | "absolute",
): Promise<RefractLookup[]> {
  const query = new URLSearchParams({ type });
  if (type === "episode") {
    if (season !== undefined) query.set("season", String(season));
    if (episode !== undefined) query.set("number", String(episode));
    query.set("numbering", numbering || (idType === "tvdb" ? "tvdb" : "tmdb"));
  }
  try {
    const data = await request<{ data?: RefractLookup[] }>(
      key,
      `/search/${idType}/${encodeURIComponent(externalId)}?${query}`,
    );
    return Array.isArray(data?.data) ? data.data : [];
  } catch (error) {
    if (error instanceof RefractApiError && error.status === 404) return [];
    throw error;
  }
}
export async function writeRefractMovie(
  key: string,
  movieId: string | number,
  watchedAt: number,
  requestId: string,
): Promise<void> {
  await request(
    key,
    "/history/movies",
    "POST",
    {
      movie_id: movieId,
      watched_at: new Date(watchedAt).toISOString(),
    },
    requestId,
  );
}
export async function writeRefractEpisode(
  key: string,
  showId: string | number,
  season: number,
  number: number,
  watchedAt: number,
): Promise<void> {
  await request(
    key,
    `/history/episodes/${encodeURIComponent(String(showId))}/${season}/${number}`,
    "PUT",
    { watched_at: new Date(watchedAt).toISOString() },
  );
}
