// A one-record licensed reference catalog, not a general-purpose provider.
// Composition and performance dedicated to the public domain; performer Nieb.
// https://commons.wikimedia.org/wiki/File:Carl_Philipp_Emanuel_Bach_-_Solfeggietto.ogg
return {
  id: "commons-public-domain",
  name: "Commons public-domain audio",
  version: "1.0.0",
  searchTracks(query, limit) {
    const track = {
      id: "solfeggietto",
      title: "Solfeggietto",
      artist: "Carl Philipp Emanuel Bach (Nieb)",
      duration: 63.72,
    };
    const matches = (track.title + " " + track.artist).toLowerCase().includes(query.toLowerCase());
    const tracks = matches && limit > 0 ? [track] : [];
    return { tracks, total: tracks.length };
  },
  getTrackStreamUrl(id) {
    if (id !== "solfeggietto") throw new Error("unknown track");
    return {
      streamUrl:
        "https://upload.wikimedia.org/wikipedia/commons/d/d4/Carl_Philipp_Emanuel_Bach_-_Solfeggietto.ogg",
    };
  },
};
