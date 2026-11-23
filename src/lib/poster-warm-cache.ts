// Session-only poster metadata. Disk thumbnails hold the image bytes; these bounded
// maps only remember which URL succeeded and which thumbnail rung a card measured.
// Virtualized cards can remount without replaying slow provider fallbacks or sizing.
const MAX_POSTER_CHOICES = 4096;
const MAX_POSTER_SIZES = 4096;
const chosenPosters = new Map<string, string>();
const posterSizes = new Map<string, number>();

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function recall<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) remember(cache, key, value, cache.size);
  return value;
}

/** Include the source poster and provider preferences: changed artwork must not inherit stale pixels. */
export function posterCardCacheKey(parts: readonly unknown[]): string {
  return JSON.stringify(parts);
}

export function recallPosterChoice(key: string): string | undefined {
  return recall(chosenPosters, key);
}

export function rememberPosterChoice(key: string, url: string): void {
  if (key && url) remember(chosenPosters, key, url, MAX_POSTER_CHOICES);
}

export function recallPosterSize(key: string): number {
  return recall(posterSizes, key) ?? 0;
}

export function rememberPosterSize(key: string, pixels: number): void {
  if (!key || !Number.isFinite(pixels) || pixels <= 0) return;
  const previous = posterSizes.get(key) ?? 0;
  if (pixels > previous) remember(posterSizes, key, pixels, MAX_POSTER_SIZES);
}
