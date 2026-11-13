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
export async function verifyRefractKey(key: string): Promise<string> {
  const profile = await request<{ username?: string; display_name?: string }>(key, "/me");
  return profile?.username || profile?.display_name || "Connected";
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
