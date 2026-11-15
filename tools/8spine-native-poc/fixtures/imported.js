const track = { id: 73, title: "Imported test tone", artist: "Fixture", duration: 3 };
return {
  id: "imported-fixture",
  name: "Imported fixture",
  version: "1",
  searchTracks(query, limit) {
    const matches = track.title.toLowerCase().includes(query.toLowerCase());
    const tracks = matches ? [track].slice(0, limit) : [];
    return { tracks, total: tracks.length };
  },
  getTrackStreamUrl(id, quality) {
    if (id !== track.id) throw new Error("Unknown track");
    return {
      streamUrl: "https://example.invalid/fixture.wav",
      track: { id, audioQuality: quality },
    };
  },
};
