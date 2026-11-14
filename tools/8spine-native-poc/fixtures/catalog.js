return {
  id: "harbor-fixture",
  name: "Harbor fixture",
  version: "1.0.0",
  async searchTracks(query, limit) {
    const tracks = [{ id: 42, title: "Original test tone", artist: "Fixture", duration: 5 }]
      .filter(t => (t.title + " " + t.artist).toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);
    return { tracks, total: tracks.length };
  },
  async getTrackStreamUrl(id, quality) {
    if (id !== 42) throw new Error("Unknown track");
    return { streamUrl: "https://example.invalid/fixture.wav", track: { id, audioQuality: quality } };
  },
};
