import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function harness() {
  const storage = new Map();
  const watchedMovies = new Set();
  const watchedEpisodes = new Map();
  const calls = [];
  const oldStorage = globalThis.localStorage;
  const oldWindow = globalThis.window;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = new EventTarget();
  let account = "refract-account-1";
  let key = "rfk_fixture_1";
  let enabled = true;
  let primary = true;
  let episodePages = [];
  let moviePages = [];
  let changePages = [];
  let failCode = 0;

  class RefractApiError extends Error {
    constructor(status, retryAfterMs = 0) {
      super(`Refract HTTP ${status}`);
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  }

  const library = {
    "@/lib/active-profile-id": { activeProfileIsPrimary: () => primary },
    "@/lib/manual-watched": {
      manualWatchedState: (id, season, number) => watchedEpisodes.get(`${id}|${season}|${number}`),
      applyRemoteWatched: (id, add) => {
        calls.push(["apply-episodes", id, add]);
        for (const episode of add) watchedEpisodes.set(`${id}|${episode.season}|${episode.episode}`, true);
      },
    },
    "@/lib/movie-watched": {
      isMovieWatchedLocal: (id) => watchedMovies.has(id),
      setMovieWatchedLocal: (id, on) => {
        calls.push(["apply-movie", id, on]);
        if (on) watchedMovies.add(id);
      },
    },
    "./client": {
      getRefractKey: () => key,
      refractEnabled: () => enabled,
      RefractApiError,
      getRefractProfile: async () => ({ id: account }),
      getRefractSyncHead: async () => {
        calls.push(["head"]);
        return "head-cursor";
      },
      listRefractHistory: async (_key, phase) => {
        calls.push(["history", phase]);
        if (failCode) throw new RefractApiError(failCode);
        return (phase === "episodes" ? episodePages : moviePages).shift() ?? {
          data: [],
          next_cursor: null,
          has_more: false,
        };
      },
      listRefractChanges: async (_key, cursor) => {
        calls.push(["changes", cursor]);
        return changePages.shift() ?? {
          data: [],
          next_cursor: "live-cursor",
          has_more: false,
        };
      },
    },
  };
  const source = readFileSync(new URL("../src/lib/refract/inbound.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(
    (name) => {
      assert.ok(name in library, `Unexpected dependency: ${name}`);
      return library[name];
    },
    module,
    module.exports,
  );
  return {
    sync: module.exports,
    watchedMovies,
    watchedEpisodes,
    calls,
    storage,
    setAccount: (id) => { account = id; },
    setPrimary: (v) => { primary = v; },
    setKey: (v) => { key = v; },
    setEnabled: (v) => { enabled = v; },
    setFailure: (v) => { failCode = v; },
    addEpisodePages: (...pages) => episodePages.push(...pages),
    addMoviePages: (...pages) => moviePages.push(...pages),
    addChangePages: (...pages) => changePages.push(...pages),
    cleanup: () => {
      globalThis.localStorage = oldStorage;
      globalThis.window = oldWindow;
    },
  };
}

const episode = (type = "show", anime = false) => ({
  show: {
    type,
    is_anime: anime,
    ids: { refract: "show1", imdb: "tt11280740", tmdb: 95396 },
  },
  episode: { season: 2, number: 4 },
});
const movie = () => ({
  id: "play1",
  movie: {
    type: "movie",
    is_anime: false,
    ids: { refract: "movie1", imdb: "tt999999", tmdb: 321 },
  },
});
const page = (data, cursor = null, hasMore = false) => ({
  data,
  next_cursor: cursor,
  has_more: hasMore,
});

test("first inbound sync takes head before snapshot and imports watched episodes and movies", async () => {
  const h = harness();
  try {
    h.addEpisodePages(page([episode()]));
    h.addMoviePages(page([movie()]));
    h.addChangePages(page([], "cursor-1"));
    await h.sync.pollRefractInbound();
    assert.deepEqual(h.calls.filter((x) => ["head", "history", "changes"].includes(x[0])).map((x) => x[0]), [
      "head", "history", "history", "changes",
    ]);
    assert.equal(h.watchedEpisodes.get("tt11280740|2|4"), true);
    assert.equal(h.watchedEpisodes.get("tmdb:tv:95396|2|4"), true);
    assert.equal(h.watchedMovies.has("tmdb:movie:321"), true);
    assert.equal(h.sync.refractInboundStatus().active, true);
    const state = JSON.parse(h.storage.get("harbor.refract.inbound.v1"));
    assert.equal(state.cursor, "cursor-1");
    assert.equal(state.account, "refract-account-1");
  } finally {
    h.cleanup();
  }
});

test("subsequent poll reuses its change cursor without repeating the full snapshot", async () => {
  const h = harness();
  try {
    await h.sync.pollRefractInbound();
    h.calls.length = 0;
    h.addChangePages(page([{
      type: "episode_watch", action: "upsert", item: episode(),
    }], "cursor-2"));
    await h.sync.pollRefractInbound();
    assert.deepEqual(h.calls.filter((c) => c[0] === "changes"), [["changes", "live-cursor"]]);
    assert.equal(h.calls.some((c) => c[0] === "head" || c[0] === "history"), false);
    assert.equal(h.watchedEpisodes.get("tt11280740|2|4"), true);
  } finally {
    h.cleanup();
  }
});

test("an account change discards the previous account cursor", async () => {
  const h = harness();
  try {
    await h.sync.pollRefractInbound();
    h.setAccount("refract-account-2");
    h.calls.length = 0;
    await h.sync.pollRefractInbound();
    assert.equal(h.calls[0][0], "head");
    assert.equal(h.sync.refractInboundStatus().active, true);
    assert.equal(JSON.parse(h.storage.get("harbor.refract.inbound.v1")).account, "refract-account-2");
  } finally {
    h.cleanup();
  }
});

test("explicit local unwatched overrides are never silently overwritten", async () => {
  const h = harness();
  try {
    h.watchedEpisodes.set("tt11280740|2|4", false);
    h.addEpisodePages(page([episode()]));
    await h.sync.pollRefractInbound();
    assert.equal(h.watchedEpisodes.get("tt11280740|2|4"), false);
    assert.equal(h.watchedEpisodes.get("tmdb:tv:95396|2|4"), true);
  } finally {
    h.cleanup();
  }
});

test("Refract anime TMDB numbering never writes into an unverified IMDb anime alias", async () => {
  const h = harness();
  try {
    h.addEpisodePages(page([episode("show", true)]));
    await h.sync.pollRefractInbound();
    assert.equal(h.watchedEpisodes.has("tt11280740|2|4"), false);
    assert.equal(h.watchedEpisodes.get("tmdb:tv:95396|2|4"), true);
  } finally {
    h.cleanup();
  }
});

test("remote deletes don't erase potentially independently watched Harbor items", async () => {
  const h = harness();
  try {
    h.watchedEpisodes.set("tt11280740|2|4", true);
    h.watchedMovies.add("tmdb:movie:321");
    h.addChangePages(page([
      { type: "episode_watch", action: "delete", show: episode().show.ids, episode: episode().episode, item: null },
      { type: "movie_play", action: "delete", movie: movie().movie.ids, item: null },
    ], "cursor-3"));
    await h.sync.pollRefractInbound();
    assert.equal(h.watchedEpisodes.get("tt11280740|2|4"), true);
    assert.equal(h.watchedMovies.has("tmdb:movie:321"), true);
  } finally {
    h.cleanup();
  }
});

test("403 missing history scope is visible and the read cursor is not advanced", async () => {
  const h = harness();
  try {
    h.setFailure(403);
    await h.sync.pollRefractInbound();
    assert.match(h.sync.refractInboundStatus().error, /history:read/);
    assert.equal(JSON.parse(h.storage.get("harbor.refract.inbound.v1")).phase, "episodes");
  } finally {
    h.cleanup();
  }
});
