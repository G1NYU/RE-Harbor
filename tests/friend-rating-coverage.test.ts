import assert from "node:assert/strict";
import test from "node:test";

const values = new Map<string, string>([
  [
    "harbor.tmdb.imdb.v1",
    JSON.stringify({ "tmdb:movie:600001": "tt9900001", "tmdb:tv:600002": "tt9900002" }),
  ],
  [
    "harbor.imdb.tmdb.v1",
    JSON.stringify({ tt9900001: "tmdb:movie:600001", tt9900002: "tmdb:tv:600002" }),
  ],
]);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
  },
});
const { applyAuthResult, reloadSession } = await import("@/lib/theme-auth");
const { loadTitleRatingSummary, invalidateTitleReviewCaches } =
  await import("@/lib/social/title-reviews");
const { sameTitle, pickTitleRating } = await import("@/lib/social/review-rank");
const { clearUserDirectoryCache } = await import("@/lib/social/user-directory");
const { tmdbFromImdbCached } = await import("@/lib/providers/tmdb/tmdb-imdb-resolve");
const { ensureMarksForTitle } = await import("@/lib/social/friend-review-index");

test("verified title aliases match while different media types and unrelated ids stay separate", () => {
  assert.equal(
    sameTitle(
      { itemKey: "tt9900001", mediaType: "movie" },
      { itemKey: "tmdb:movie:600001", mediaType: "movie" },
    ),
    true,
  );
  assert.equal(
    sameTitle(
      { itemKey: "tt9900002", mediaType: "series" },
      { itemKey: "tmdb:tv:600002", mediaType: "series" },
    ),
    true,
  );
  assert.equal(
    sameTitle(
      { itemKey: "tt9900001", mediaType: "movie" },
      { itemKey: "tmdb:movie:600001", mediaType: "series" },
    ),
    false,
  );
  assert.equal(
    sameTitle(
      { itemKey: "tt9900001", mediaType: "movie" },
      { itemKey: "tmdb:movie:600099", mediaType: "movie" },
    ),
    false,
  );
  assert.equal(
    pickTitleRating(
      [
        {
          itemKey: "tmdb:movie:600001",
          mediaType: "movie",
          score: 8,
          at: "2026-11-19T00:00:00Z",
          title: "Fixture",
        },
      ],
      { itemKey: "tt9900001", mediaType: "movie" },
    )?.score,
    8,
  );
});

test("fresh Cinemeta mappings find a new rating by the sixtieth friend without a TMDB key", async (t) => {
  let now = Date.now();
  let published = false;
  let historyReads = 0;
  let metadataReads = 0;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { hostname: "fixture.invalid" },
      addEventListener: () => {},
      setTimeout,
      clearTimeout,
    },
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  assert.equal(tmdbFromImdbCached("tt9900011"), undefined);
  assert.equal(tmdbFromImdbCached("tt9900012"), undefined);
  t.mock.method(Date, "now", () => now);
  const friends = Array.from({ length: 60 }, (_, index) => ({
    handle: `friend-${index}`,
    alias: `Friend ${index}`,
  }));
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/themes/api", "");
    if (url.hostname === "v3-cinemeta.strem.io") {
      metadataReads++;
      const movie = path === "/meta/movie/tt9900011.json";
      assert.ok(movie || path === "/meta/series/tt9900012.json");
      return Response.json({
        meta: {
          id: movie ? "tt9900011" : "tt9900012",
          imdb_id: movie ? "tt9900011" : "tt9900012",
          moviedb_id: movie ? 600011 : 600012,
          type: movie ? "movie" : "series",
          name: "Fixture",
        },
      });
    }
    if (path === "/social/reviews") return Response.json({ error: "not_found" }, { status: 404 });
    if (path === "/social/friends") return Response.json(friends);
    if (path === "/social/groups/discover") return Response.json({ groups: [] });
    if (/^\/social\/u\/friend-\d+\/ratings$/.test(path)) {
      historyReads++;
      const movie = url.searchParams.get("type") === "movie";
      return Response.json({
        items:
          published && path.includes("/friend-59/")
            ? [
                {
                  itemKey: movie ? "tmdb:movie:600011" : "tmdb:tv:600012",
                  mediaType: movie ? "movie" : "series",
                  score: movie ? 8 : 7,
                  at: "2026-11-19T00:00:00Z",
                  title: "Fixture",
                },
              ]
            : [],
      });
    }
    throw new Error(`Unexpected request ${path}`);
  });
  invalidateTitleReviewCaches();
  clearUserDirectoryCache();
  applyAuthResult({
    token: "fixture-token",
    user: { id: "viewer", handle: "viewer", username: "viewer" },
  });
  try {
    const target = { itemKey: "tt9900011", mediaType: "movie" } as const;
    assert.equal((await loadTitleRatingSummary(target)).total, 0);
    published = true;
    now += 10_001;
    const movie = await loadTitleRatingSummary(target);
    assert.equal(movie.averageScore, 8);
    assert.equal(movie.total, 1);
    assert.deepEqual(
      movie.friends.map((rating) => rating.handle),
      ["friend-59"],
    );
    const series = await loadTitleRatingSummary({ itemKey: "tt9900012", mediaType: "series" });
    assert.equal(series.averageScore, 7);
    assert.deepEqual(
      series.friends.map((rating) => rating.handle),
      ["friend-59"],
    );
    assert.equal(historyReads, 180);
    assert.ok(metadataReads >= 2);
    assert.equal(tmdbFromImdbCached("tt9900011"), "tmdb:movie:600011");
    assert.equal(tmdbFromImdbCached("tt9900012"), "tmdb:tv:600012");
  } finally {
    reloadSession(true);
    invalidateTitleReviewCaches();
    clearUserDirectoryCache();
  }
});

test("the live review API combines verified catalog ids and uses each person's latest score once", async (t) => {
  const now = Date.now() + 60_000;
  t.mock.method(Date, "now", () => now);
  const queriedIds = new Set<string>();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/themes/api/social/reviews");
    const contentId = url.searchParams.get("contentId")!;
    queriedIds.add(contentId);
    const row = (handle: string, score: number, minute: number) => ({
      id: `${handle}-${contentId}`,
      contentType: "movie",
      contentId,
      score,
      updatedAt: `2026-11-19T00:0${minute}:00Z`,
      createdAt: "2026-11-19T00:00:00Z",
      author: { handle, displayName: handle },
    });
    const items =
      url.searchParams.get("scope") === "friends"
        ? []
        : contentId === "tt9900001"
          ? [row("shared", 8, 0), row("other", 6, 2)]
          : [row("shared", 10, 3), row("third", 5, 1)];
    return Response.json({ items, total: items.length });
  });
  invalidateTitleReviewCaches();
  applyAuthResult({
    token: "fixture-token",
    user: { id: "viewer", handle: "viewer", username: "viewer" },
  });
  try {
    const summary = await ensureMarksForTitle("movie", "tt9900001");
    assert.equal(summary?.averageScore, 7);
    assert.equal(summary?.total, 3);
    assert.deepEqual(
      summary?.community.map((mark) => mark.handle),
      ["shared", "other", "third"],
    );
    assert.deepEqual([...queriedIds], ["tt9900001", "tmdb:movie:600001"]);
  } finally {
    reloadSession(true);
    invalidateTitleReviewCaches();
  }
});
