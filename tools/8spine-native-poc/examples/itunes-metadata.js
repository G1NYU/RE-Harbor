// Original metadata-only example module. Uses Apple's public Search API.
// No playback URL, artwork, or promotional audio is imported.
return {
  id: "harbor-itunes-metadata",
  name: "iTunes (metadata only)",
  version: "1.0.0",
  async searchTracks(query, limit) {
    const n = Math.min(5, Math.max(1, limit));
    const response = await fetch(
      "https://itunes.apple.com/search?country=US&media=music&entity=song&limit=" +
        n +
        "&term=" +
        encodeURIComponent(query),
    );
    if (!response.ok) throw new Error("catalog-unavailable");
    const result = await response.json();
    const tracks = result.results
      .filter(
        (t) =>
          t.kind === "song" && t.trackId && t.trackName && t.artistName && t.trackTimeMillis > 0,
      )
      .slice(0, n)
      .map((t) => ({
        id: t.trackId,
        title: t.trackName,
        artist: t.artistName,
        duration: t.trackTimeMillis / 1000,
      }));
    return { tracks, total: tracks.length };
  },
};
