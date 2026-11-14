/**
 * Reference contract adapter for trusted, locally authored fixture objects only.
 * No evaluation, downloads, filesystem, or production runtime. That boundary
 * belongs to a future isolated worker. The URL is validated, not fetched here.
 */
export function makeFixtureAdapter(module) {
  if (!module || typeof module.id !== 'string' || !module.id ||
      typeof module.searchTracks !== 'function' ||
      typeof module.getTrackStreamUrl !== 'function') throw new Error('Invalid module contract');
  const validId = id => (typeof id === 'string' && id.length > 0 && id.length <= 512) ||
    (typeof id === 'number' && Number.isSafeInteger(id));
  const canonical = raw => {
    if (!raw || !validId(raw.id) || typeof raw.title !== 'string' ||
        typeof raw.artist !== 'string' || !raw.title.trim() || !raw.artist.trim()) return null;
    return {
      moduleId: module.id,
      trackId: raw.id,
      title: raw.title,
      artist: raw.artist,
      album: typeof raw.album === 'string' ? raw.album : null,
      durationSeconds: Number.isFinite(raw.duration) && raw.duration >= 0 ? raw.duration : null,
      albumCover: typeof raw.albumCover === 'string' ? raw.albumCover : null,
    };
  };
  return {
    async search(query, limit = 20) {
      if (typeof query !== 'string' || !query.trim() || query.length > 512 ||
          !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid search');
      const result = await module.searchTracks(query, limit);
      if (!result || !Array.isArray(result.tracks)) throw new Error('Invalid search response');
      return result.tracks.slice(0, limit).map(canonical).filter(Boolean);
    },
    async resolve(track, quality = 'HIGH') {
      if (!track || track.moduleId !== module.id || !validId(track.trackId)) throw new Error('Wrong module or track');
      if (!['LOSSLESS', 'HIGH', 'LOW'].includes(quality)) throw new Error('Invalid quality');
      const result = await module.getTrackStreamUrl(track.trackId, quality);
      if (!result || typeof result.streamUrl !== 'string') throw new Error('Invalid stream response');
      const url = new URL(result.streamUrl);
      if (url.protocol !== 'https:' || url.username || url.password ||
          url.hostname !== 'example.invalid') throw new Error('Fixture stream must use example.invalid');
      return { streamUrl: url.href, quality: result.track?.audioQuality ?? null };
    },
  };
}
