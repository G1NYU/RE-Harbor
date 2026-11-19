// Browser-only layout test with synthetic catalog data. Does not contact real providers
// or use an installed Harbor profile, account or audio stream.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
const require = createRequire(resolve(process.env.MUSIC_BROWSER_DEPS, "package.json"));
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "msedge" });
const folder = "music-polish-screenshots";
await mkdir(folder, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(35000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem(
    "harbor.onboarding",
    JSON.stringify({
      onboarded: true,
      nudges: { "content-advisory": true },
    }),
  );
  localStorage.setItem(
    "harbor.profiles.v1",
    JSON.stringify({
      activeId: "music-smoke",
      profiles: [
        { id: "music-smoke", name: "Music Smoke", isPrimary: true, color: "#292738", avatar: null },
      ],
    }),
  );
});
const art =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#272738"/><path d="M30 330L440 50M60 470L500 155" stroke="#9baedc" stroke-width="16"/><text x="55" y="265" font-size="70" font-family="sans-serif" font-weight="bold" fill="#e0e7fa">HARBOR</text><text x="55" y="325" font-size="43" font-family="sans-serif" fill="#a8b4d7">MUSIC TEST</text></svg>',
  );
const tracks = Array.from({ length: 12 }, (_, index) => ({
  id: "music-smoke-track-" + (index + 1),
  connectorId: "local",
  title:
    ["The Long Way Across the Ocean", "Evening with All the Colors", "Another Day at the Coast"][
      index % 3
    ] + (index ? " " + (index + 1) : ""),
  artist: "Masayoshi Takanaka",
  album: "An Island in the Sun",
  artwork: art,
  durationSeconds: 236 + index,
  durationLabel: "3:56",
}));
const album = {
  id: "music-smoke-album",
  connectorId: "local",
  title: "An Island in the Sun",
  artist: "Masayoshi Takanaka",
  artwork: art,
  trackCount: tracks.length,
  year: 1980,
};
const artist = {
  id: "music-smoke-artist",
  connectorId: "local",
  name: "Masayoshi Takanaka",
  artwork: art,
  subtitle: "Artist",
};
try {
  await page.goto("http://127.0.0.1:1420", { waitUntil: "domcontentloaded" });
  await page.locator('[data-harbor-nav="music"]').click();
  await page.locator("[data-music-view]").waitFor();
  await page.locator("[data-music-mast-form]").waitFor();
  const mastForm = await page.locator("[data-music-mast-form]").evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    border: getComputedStyle(el).borderTopWidth,
  }));
  assert.ok(mastForm.width >= 300, "Music search must have readable width");
  assert.equal(mastForm.border, "0px", "Music search must not add an outer border");
  const innerSearch = await page.locator("[data-music-mast-search]").evaluate((el) => ({
    border: getComputedStyle(el).borderTopWidth,
    background: getComputedStyle(el).backgroundColor,
  }));
  assert.equal(
    innerSearch.border,
    "0px",
    "Music search input must not draw a nested inner outline",
  );
  await page.screenshot({ path: folder + "/music-search-1600.png" });
  const voidTools = page.locator("[data-void-topbar-utilities]");
  if (await voidTools.count()) {
    await voidTools.locator("[data-void-topbar-account] button").first().waitFor();
    const topRect = await voidTools.boundingBox();
    assert.ok(
      topRect && topRect.y >= 0 && topRect.y < 85,
      "Account and sidebar controls belong in the topbar, above the player",
    );
    assert.equal(
      await page.locator("[data-harbor-sidebar-footer]").count(),
      0,
      "VOID sidebar must not hide the account behind the full-width music dock",
    );
    const topSearch = await page.locator("[data-music-mast-form]").boundingBox();
    // X-ranges can overlap safely when controls occupy different vertical bands.
    assert.ok(
      topSearch &&
        (topRect.y + topRect.height <= topSearch.y + 1 ||
          topSearch.y + topSearch.height <= topRect.y + 1 ||
          topRect.x + topRect.width <= topSearch.x + 1 ||
          topSearch.x + topSearch.width <= topRect.x + 1),
      "Music search and window utilities must not intersect",
    );
  }

  // Add a provider-free Tauri invoke shim only AFTER mounting the browser app.
  // Production environment detection stays unchanged, while fixture data is returned.
  await page.evaluate(
    async (payload) => {
      window.__TAURI_INTERNALS__ = {
        invoke: async (command, args) => {
          if (command === "music_db_init")
            return {
              likedIds: [],
              likedTracks: [],
              queue: payload.tracks,
              recents: [payload.tracks[0]],
            };
          if (command === "music_source_candidates")
            return new Promise((resolve) => {
              window.finishQueueSourceLookup = () => resolve([]);
            });
          if (command === "music_album_tracks") return payload.tracks;
          if (command === "music_local_collection")
            return {
              items: payload.tracks.map((t) => ({ ...t, kind: "track" })),
              nextOffset: null,
            };
          if (command === "music_artist_catalog")
            return {
              items:
                args?.kind === "tracks" ? payload.tracks.map((t) => ({ ...t, kind: "track" })) : [],
              nextCursor: null,
              scope: "catalog",
            };
          if (command === "music_artist_rows") return [];
          if (
            command === "music_connections" ||
            command === "music_home_rows" ||
            command === "music_audio_devices"
          )
            return [];
          if (command === "music_get_checkpoint") return null;
          return null;
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
      };
      const mod = await import("/src/lib/music/player.ts");
      await mod.initializeMusic();
    },
    { tracks },
  );

  // In the browser fixture, Tauri is mocked only after mount. The initial
  // connection warning is a test harness artifact; retrying clears its music
  // route and prevents synthetic album navigation. Do not mutate app state here.
  const bar = page.locator("[data-music-dock]:not([data-music-dock-tab])");
  await bar.waitFor();
  const dockRect = await bar.boundingBox();
  assert.ok(dockRect, "Full music dock did not mount");
  assert.ok(dockRect.x < 2, "Dock must begin at the left window edge");
  assert.ok(
    Math.abs(dockRect.x + dockRect.width - 1600) < 3,
    "Dock must reach the right window edge",
  );
  await page.screenshot({ path: folder + "/dock-1600.png" });
  const openQueue = bar.getByRole("button", { name: "Open queue", exact: true });
  await openQueue.click();
  const queue = page.locator("[data-music-queue]");
  assert.match(await queue.locator("header p").innerText(), /11 up next · 45 min/);
  const row = queue.locator(".music-queue-upcoming li").first();
  const more = row.locator("button[aria-expanded]").first();
  await more.click();
  const sources = row.getByRole("button", { name: "Try another source" });
  await page.setViewportSize({ width: 320, height: 720 });
  const actionBounds = await row.locator(".music-queue-actions").evaluate((el) => {
    const panel = el.closest("[data-music-queue]").getBoundingClientRect();
    return [...el.querySelectorAll("button")].every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left >= panel.left && rect.right <= panel.right;
    });
  });
  assert.ok(actionBounds, "Every queue action must fit within the narrow panel");
  await page.setViewportSize({ width: 1600, height: 900 });
  await queue.locator(".music-queue-scroll").evaluate((el) => el.scrollTo(0, 0));
  await queue.screenshot({ path: folder + "/queue-actions.png" });
  await sources.click();
  await row.getByRole("status").waitFor();
  assert.equal(await sources.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await sources.evaluate((el) => el === document.activeElement), true);
  await page.evaluate(() => window.finishQueueSourceLookup());
  assert.equal(await row.locator(".music-queue-sources").count(), 0);
  await page.evaluate(async () => {
    const { dispatchTvNav } = await import("/src/lib/keyboard-navigation.ts");
    dispatchTvNav("back");
  });
  assert.equal(await more.evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press("Escape");
  await queue.waitFor({ state: "hidden" });
  assert.equal(await openQueue.evaluate((el) => el === document.activeElement), true);
  // Clicking the unused left edge must open the existing full music player.
  await bar.click({ position: { x: 20, y: 25 } });
  const now = page.locator(".music-now-playing");
  await now.waitFor();
  // Capture settled pixels, not the transparent halfway frame of the 280ms
  // opening animation. Verify the full listening environment is opaque.
  const fullPlayer = await now.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      opacity: Number(style.opacity),
      background: style.backgroundColor,
      x: rect.x,
      right: rect.right,
    };
  });
  assert.ok(fullPlayer.opacity >= 0.99, "Now Playing must finish fully opaque");
  assert.notEqual(
    fullPlayer.background,
    "rgba(0, 0, 0, 0)",
    "Now Playing needs its own solid canvas",
  );
  assert.ok(
    fullPlayer.x < 2 && Math.abs(fullPlayer.right - 1600) < 3,
    "Now Playing must span the window",
  );
  await page.screenshot({ path: folder + "/now-playing-1600.png" });
  await page.setViewportSize({ width: 2048, height: 1124 });
  const widePlayer = await now.boundingBox();
  assert.ok(
    widePlayer && widePlayer.x < 2 && Math.abs(widePlayer.x + widePlayer.width - 2048) < 3,
    "Now Playing should span a 2048px-wide window",
  );
  await page.screenshot({ path: folder + "/now-playing-2048.png" });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.locator("[data-music-dock-close]").click();
  await page.locator(".music-now-playing").waitFor({ state: "hidden" });

  async function explore(kind) {
    await page.evaluate(
      async (payload) => {
        const mod = await import("/src/lib/music/navigation.ts");
        mod.requestMusicExplore({
          kind: payload.kind,
          track: payload.track,
          ...(payload.kind === "album" ? { album: payload.item } : { artist: payload.item }),
        });
      },
      { kind, track: tracks[0], item: kind === "album" ? album : artist },
    );
  }

  await explore("album");
  const albumView = page.locator('.music-detail-page[data-music-album="true"]');
  await albumView.waitFor();
  await albumView.locator(".music-detail-track-list > .group").first().waitFor();
  const albumMetrics = await albumView.evaluate((el) => {
    const hero = el.querySelector(".music-detail-hero");
    const rows = el.querySelector(".music-detail-track-list");
    return {
      width: el.getBoundingClientRect().width,
      heroColumns: getComputedStyle(hero).gridTemplateColumns,
      rowColumns: getComputedStyle(rows).gridTemplateColumns,
      fade: getComputedStyle(hero, "::before").maskImage,
    };
  });
  assert.ok(albumMetrics.width > 1100, "Album page should use the available desktop width");
  assert.ok(
    albumMetrics.heroColumns.split(" ").length >= 2,
    "Album hero should have two desktop columns",
  );
  assert.ok(
    albumMetrics.rowColumns.split(" ").length >= 2,
    "Album track list should use two desktop columns",
  );
  assert.match(albumMetrics.fade, /radial-gradient/, "Album tint should fade toward the canvas");
  await page.screenshot({ path: folder + "/album-1600.png" });

  await explore("artist");
  const artistView = page.locator('.music-detail-page[data-music-artist="true"]');
  await artistView.waitFor();
  await artistView.locator(".music-detail-track-list > .group").first().waitFor();
  const artistMetrics = await artistView.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    art: el.querySelector(".music-detail-art").getBoundingClientRect().width,
    columns: getComputedStyle(el.querySelector(".music-detail-track-list")).gridTemplateColumns,
  }));
  assert.ok(artistMetrics.width > 1100);
  assert.ok(artistMetrics.art >= 250, "Artist portrait must be more than a small avatar");
  assert.ok(
    artistMetrics.columns.split(" ").length >= 2,
    "Artist tracks must be legible in two columns",
  );
  await page.screenshot({ path: folder + "/artist-1600.png" });

  // Scrolling the real Music content must activate the opaque fixed topbar so
  // track rows and sticky breadcrumbs cannot bleed through its window controls.
  await page.locator("[data-music-view]").evaluate((root) => {
    root.scrollTop = 400;
    root.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const topbar = await page.locator("[data-harbor-topbar-content]").evaluate((content) => {
    const root = content.parentElement;
    const backing = root?.querySelector('div[aria-hidden="true"]');
    return backing
      ? {
          opacity: Number(getComputedStyle(backing).opacity),
          background: getComputedStyle(backing).backgroundColor,
        }
      : null;
  });
  assert.ok(topbar && topbar.opacity >= 0.95, "Scrolled Music topbar must be opaque");
  assert.notEqual(topbar.background, "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: folder + "/artist-scrolled-1600.png" });
  await page.locator("[data-music-view]").evaluate((root) => {
    root.scrollTop = 0;
  });

  await page.setViewportSize({ width: 2048, height: 1124 });
  const wideArtist = await artistView.boundingBox();
  assert.ok(wideArtist && wideArtist.width > 1600, "Artist page should fill the wide window");
  await page.screenshot({ path: folder + "/artist-2048.png" });

  await page.setViewportSize({ width: 960, height: 700 });
  const mobileColumns = await artistView
    .locator(".music-detail-track-list")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  assert.equal(mobileColumns.trim().split(/\s+/).length, 1, "Narrow artist tracks must stack");
  const compactArtist = await artistView.evaluate((el) => ({
    image: el.querySelector(".music-detail-art").getBoundingClientRect().width,
    headingTop: el.querySelector(".music-detail-title h1").getBoundingClientRect().top,
  }));
  assert.ok(compactArtist.image <= 240, "At 960px, the artist image must leave room for the name");
  assert.ok(
    compactArtist.headingTop < 650,
    "The artist name must stay visible above the fold at 960px",
  );
  await page.screenshot({ path: folder + "/artist-960.png" });
  console.log("Harbor Music geometry passed:", {
    dockRect,
    albumMetrics,
    artistMetrics,
    mobileColumns,
  });
} catch (error) {
  await page.screenshot({ path: folder + "/failed.png" }).catch(() => {});
  console.error(
    "Visible:",
    (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 1600),
  );
  console.error("Browser page errors:", errors.slice(0, 8));
  throw error;
} finally {
  await browser.close();
}
