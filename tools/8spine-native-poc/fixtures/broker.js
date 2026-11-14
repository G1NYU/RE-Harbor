return {
  async searchTracks(query, limit) {
    // Deterministic policy exercises; no request ever reaches the internet.
    if (query.startsWith("policy:")) {
      const name = query.slice(7);
      const origin = "https://catalog.example.invalid";
      const cases = {
        "http": ["http://catalog.example.invalid/catalog"],
        "private": ["https://127.0.0.1/catalog"],
        "ipv6": ["https://[::1]/catalog"],
        "metadata": ["https://169.254.169.254/catalog"],
        "alias": ["https://catalog.example.invalid.evil.invalid/catalog"],
        "credentials": ["https://user:pass@catalog.example.invalid/catalog"],
        "port": ["https://catalog.example.invalid:444/catalog"],
        "fragment": [origin + "/catalog#x"],
        "post": [origin + "/catalog", { method: "POST" }],
        "headers": [origin + "/catalog", { headers: { Authorization: "secret" } }],
        "redirect": [origin + "/redirect"],
        "oversized": [origin + "/oversized"],
        "route": [origin + "/not-approved"],
      };
      try {
        if (name === "budget") {
          for (let i = 0; i < 9; i++) await fetch(origin + "/catalog");
        } else if (name === "size") {
          await fetch(origin + "/catalog?" + "x".repeat(5000));
        } else if (name === "missing") {
          const response = await fetch(origin + "/missing");
          return { status: response.status, ok: response.ok };
        } else {
          await fetch(...cases[name]);
        }
        return { denied: false };
      } catch (error) {
        return { denied: true, code: error.message };
      }
    }
    const response = await fetch("https://catalog.example.invalid/catalog?q=" + encodeURIComponent(query));
    const payload = await response.json();
    const tracks = payload.tracks.filter(t => t.title.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
    return { tracks, total: tracks.length, rawBridge: typeof __fixtureBroker };
  },
  async getTrackStreamUrl(id, quality) {
    if (id !== 42) throw new Error("Unknown track");
    const response = await fetch("https://catalog.example.invalid/resolve");
    const payload = await response.json();
    return { streamUrl: payload.streamUrl, track: { id, audioQuality: quality } };
  },
};
