// Run with a fresh browser profile against Harbor's Vite entry point.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.env.VOID_BROWSER_DEPS, "package.json"));
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "msedge" });
const output = "void-screenshots";
await mkdir(output, { recursive: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60_000);
const film = {
  id: "tt0000001",
  type: "movie",
  name: "The Night Train",
  releaseInfo: "2024",
  // This synthetic clip is intentionally short; do not classify it as a 2-hour movie stub.
  runtime: "1",
  genres: ["Drama"],
  description: "Two travelers cross paths on the last train home.",
  trailers: [{ source: "fixture-trailer", type: "Trailer" }],
};
const series = {
  ...film,
  id: "tt0000002",
  type: "series",
  name: "After Midnight",
  videos: [
    { id: "tt0000002:1:1", title: "Departure", season: 1, episode: 1 },
    { id: "tt0000002:2:1", title: "Return", season: 2, episode: 1 },
  ],
};
await page.addInitScript(() => {
  localStorage.setItem(
    "harbor.onboarding",
    JSON.stringify({ onboarded: true, nudges: { "content-advisory": true } }),
  );
  localStorage.setItem(
    "harbor.profiles.v1",
    JSON.stringify({
      activeId: "void-test",
      profiles: [
        { id: "void-test", name: "VOID", isPrimary: true, color: "#28232f", avatar: null },
      ],
    }),
  );
  // A deterministic, browser-intercepted addon proves that VOID can display actual
  // resolved streams without installing any provider or using user credentials.
  localStorage.setItem("harbor.customlists.v1", JSON.stringify([{
    id: "void-test-list", name: "Weekend Cinema", createdAt: Date.now(),
    updatedAt: Date.now(), items: [],
  }]));
  localStorage.setItem("harbor.installed-addons.void-test", JSON.stringify([{
    id: "void-smoke-addon",
    transportUrl: "https://void-preview.invalid/manifest.json",
    installedAt: Date.now(),
    manifest: {
      id: "void-smoke-addon",
      name: "VOID Fixture Source",
      version: "1.0.0",
      types: ["movie", "series"],
      idPrefixes: ["tt"],
      resources: [{ name: "stream", types: ["movie", "series"], idPrefixes: ["tt"] }],
    },
  }]));
});
await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const item = path.includes("/series/") ? series : film;
  await route.fulfill({ json: path.includes("/catalog/") ? { metas: [item] } : { meta: item } });
});
await page.route("https://void-preview.invalid/**", async (route) => {
  const pathname = new URL(route.request().url()).pathname;
  const payload = pathname.includes("/stream/") ? { streams: [
    { name: "VOID Fixture Source", title: "The.Night.Train.2024.1080p.WEB-DL", url: "https://video-fixture.invalid/1080.mp4", behaviorHints: { videoSize: 1_900_000_000 } },
    { name: "VOID Fixture Source", title: "The.Night.Train.2024.720p.WEBRip", url: "https://video-fixture.invalid/720.mp4", behaviorHints: { videoSize: 950_000_000 } },
  ] } : { id: "void-smoke-addon", name: "VOID Fixture Source", version: "1.0.0", resources: ["stream"], types: ["movie", "series"], idPrefixes: ["tt"] };
  await route.fulfill({ json: payload });
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:1420", { waitUntil: "domcontentloaded" });
  // Produce a deterministic offline video in Edge without a third-party URL.
  const clip = await page.evaluate(async () => {
    const mime = ["video/webm;codecs=vp8", "video/webm"].find((value) => MediaRecorder.isTypeSupported(value));
    if (!mime) throw new Error("Edge cannot encode the offline playback fixture");
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 54;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    ctx.fillStyle = "#242436";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 120000 });
    try {
      const blob = await new Promise((resolve, reject) => {
        const chunks = [];
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error("Fixture encoding failed"));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
        recorder.start(150);
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = frame++ % 2 ? "#242436" : "#34364f";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (frame >= 60) {
            clearInterval(timer);
            recorder.stop();
          }
        }, 100);
      });
      return { mime, bytes: [...new Uint8Array(await blob.arrayBuffer())] };
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  });
  assert.ok(clip.bytes.length >= 100, "Browser generated no video bytes");
  const playbackBytes = Buffer.from(clip.bytes);
  // Reuse exactly the same offline video bytes for the pinned native libmpv decoder.
  await writeFile(`${output}/native-fixture.webm`, playbackBytes);
  await page.route("https://video-fixture.invalid/**", async (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), playbackBytes.length - 1) : playbackBytes.length - 1;
    const valid = start >= 0 && start <= end && end < playbackBytes.length;
    await route.fulfill({
      status: valid ? (range ? 206 : 200) : 416,
      body: valid ? playbackBytes.subarray(start, end + 1) : Buffer.alloc(0),
      headers: {
        "content-type": clip.mime,
        "access-control-allow-origin": "*",
        "accept-ranges": "bytes",
        ...(range ? { "content-range": valid
          ? "bytes " + start + "-" + end + "/" + playbackBytes.length
          : "bytes */" + playbackBytes.length } : {}),
      },
    });
  });
  const nav = page.getByRole("navigation", { name: "Media spaces" });
  await nav.getByRole("button", { name: "Watch", exact: true }).click();
  const watch = page.locator("[data-void-watch]:visible");
  await watch.locator(".void-watch-primary").first().click();
  const title = page.locator("[data-void-title]:visible");
  assert.equal(await title.locator("h1").innerText(), film.name);
  const toggle = title.getByRole("button", { name: "Add to watchlist" });
  await toggle.click();
  assert.equal(
    await title.getByRole("button", { name: "In watchlist" }).getAttribute("aria-pressed"),
    "true",
  );
  // Exercise the actual VOID actions dialog instead of only taking screenshots.
  await title.getByRole("button", { name: "More options" }).click();
  const actions = title.getByRole("dialog", { name: "Title actions" });
  await actions.getByRole("button", { name: /Choose a source/ }).waitFor();
  await actions.getByRole("button", { name: /Save to a list/ }).click();
  const listButton = actions.getByRole("button", { name: /Weekend Cinema/ });
  const listInput = actions.getByRole("textbox", { name: "New list" });
  await listInput.fill("Keyboard focus check");
  await listInput.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await actions.locator('button[type="submit"]').evaluate((el) => el === document.activeElement),
    true,
    "The custom-list text field must tab to its submit button",
  );
  await actions.getByRole("button", { name: "Open remaining tools" }).focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await actions.getByRole("button", { name: "Close title actions" }).evaluate((el) => el === document.activeElement),
    true,
    "Tab from the final title action must wrap to the modal close button",
  );
  await listButton.click();
  assert.equal(await listButton.getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => {
    const raw = localStorage.getItem("harbor.customlists.v1") ?? "[]";
    const list = JSON.parse(raw).find((entry) => entry.id === "void-test-list");
    return list?.items?.some((item) => item.id === "tt0000001") ?? false;
  }), true, "List membership should persist through the existing list store");
  await page.keyboard.press("Escape");
  assert.equal(await actions.count(), 0, "Title dialog should close on Escape");
  assert.equal(await title.locator("h1").innerText(), film.name, "Escape must not navigate back from title");
  await title.getByRole("button", { name: "More options" }).click();
  await actions.getByRole("button", { name: /Watch trailer/ }).click();
  const trailer = page.locator("[data-void-trailer]:visible");
  await trailer.waitFor();
  await trailer.getByRole("button", { name: "Close trailer" }).click();
  await trailer.waitFor({ state: "hidden" });
  assert.equal(await title.locator("h1").innerText(), film.name, "Closing trailer must preserve the VOID title");
  for (const [width, height, dir] of [
    [960, 600, "ltr"],
    [1280, 800, "ltr"],
    [1600, 900, "ltr"],
    [2560, 1080, "ltr"],
    [1280, 800, "rtl"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((dir) => {
      document.documentElement.dir = dir;
    }, dir);
    assert.ok(
      await title.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      "Title overflows horizontally",
    );
    // Horizontal overflow alone misses controls falling below the first viewport.
    if (height <= 700 && width > 740) {
      const actionPosition = await title.locator(".void-title-action-primary").evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      });
      assert.ok(
        actionPosition.top >= 0 && actionPosition.bottom <= height - 4,
        `Primary title action is not fully visible at ${width}x${height}: ` +
          JSON.stringify(actionPosition),
      );
    }
    if (width >= 1900) {
      const posterBounds = await title.locator(".void-title-poster").boundingBox();
      assert.ok(
        posterBounds && posterBounds.x >= width * 0.18 && posterBounds.x < width * 0.5,
        "Ultrawide title composition should be centered instead of anchored to the left edge",
      );
    }
    await page.screenshot({ path: `${output}/title-${width}-${height}-${dir}.png` });
  }
  await page.evaluate(() => {
    document.documentElement.dir = "ltr";
  });
  await title.getByRole("button", { name: "Back to browsing" }).click();
  await watch.getByRole("button", { name: "Series", exact: true }).click();
  await watch.locator(".void-watch-primary").first().click();
  await title.getByRole("button", { name: "Season 02" }).click();
  assert.match(await title.locator(".void-title-episode").innerText(), /Return/);
  // The series row can update watched history without opening Harbor detail tools.
  await title.getByRole("button", { name: "Episode actions: Return" }).click();
  await title.getByRole("button", { name: "Mark as watched", exact: true }).click();
  await title.locator('.void-title-episode-shell[data-watched="true"]').waitFor();
  await title.getByRole("button", { name: "Episode actions: Return" }).click();
  await title.getByRole("button", { name: "Mark as unwatched", exact: true }).click();
  await title.locator('.void-title-episode-shell[data-watched="true"]').waitFor({ state: "hidden" });

  await title.getByRole("button", { name: "More options" }).click();
  const seriesActions = title.getByRole("dialog", { name: "Title actions" });
  await seriesActions.getByRole("button", { name: /Episode reminders/ }).click();
  await seriesActions.getByRole("button", { name: "Save reminder" }).click();
  assert.equal(await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("harbor.reminders.v1") ?? "{}");
    return saved["tt0000002"]?.episodes === true &&
      saved["tt0000002"]?.seasons === true;
  }), true, "Episode reminders should be persisted by the existing notification store");
  await page.keyboard.press("Escape");
  assert.equal(await title.locator("h1").innerText(), series.name);
  await page.screenshot({ path: `${output}/series-episodes.png` });
  await title.evaluate((el) => { el.scrollTop = 0; });
  await page.screenshot({ path: `${output}/series-top.png` });
  await nav.getByRole("button", { name: "Listen", exact: true }).click();
  await page.locator("[data-void-listening-deck]:visible").waitFor();
  await page.screenshot({ path: `${output}/listen.png` });
  await nav.getByRole("button", { name: "Watch", exact: true }).click();
  await watch.locator(".void-watch-primary").first().click();
  await title.getByRole("button", { name: "More options" }).click();
  await title.getByRole("dialog", { name: "Title actions" })
    .getByRole("button", { name: /Choose a source/ }).click();
  const board = page.locator("[data-void-source-board]:visible");
  await board.waitFor({ timeout: 20_000 });
  assert.match(await board.innerText(), /VOID Fixture Source/);
  assert.equal(await board.locator(".void-source-row").count(), 1);
  const firstChoice = await board.locator(".void-source-feature").boundingBox();
  assert.ok(
    firstChoice && firstChoice.y + firstChoice.height <= 800,
    `First source choice is clipped below the 1280x800 viewport: ${JSON.stringify(firstChoice)}`,
  );
  await page.screenshot({ path: `${output}/void-sources-first-screen.png` });
  await board.getByText("Advanced filters", { exact: true }).click();
  assert.ok(await board.locator(".void-source-advanced select").count() >= 3);
  await page.screenshot({ path: `${output}/void-sources-filters.png` });
  // Real player handoff: assert the HTML5 decoder produced a first video frame.
  await board.locator(".void-source-feature").click();
  const player = page.locator("[data-harbor-player]:visible");
  await player.waitFor({ timeout: 30000 });
  await player.locator("[data-player-video-mount]").waitFor();
  // Store the frame details atomically: Harbor can reset a deliberately
  // 1-second stub immediately after the first decode, before a second evaluate.
  const firstFrame = await page.waitForFunction(() => {
    const video = document.querySelector("[data-harbor-player] [data-player-video-mount] video");
    if (!(video instanceof HTMLVideoElement) ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 || video.videoHeight <= 0 || video.error != null) return null;
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      source: video.currentSrc,
      readyState: video.readyState,
    };
  }, undefined, { timeout: 25000 });
  const decoded = await firstFrame.jsonValue();
  assert.equal(decoded.width, 96, "The source should decode a fixture frame");
  assert.equal(decoded.height, 54);
  assert.match(decoded.source, /video-fixture\.invalid\/1080\.mp4/);
  await player.locator(".void-video-controls").waitFor({ state: "attached", timeout: 12000 });
  assert.equal(await player.locator(".void-video-controls").count(), 1,
    "VOID player must render its native transport");
  // The first decoded frame is not enough if the connecting overlay never clears.
  await player.locator(".harbor-connecting").waitFor({ state: "hidden", timeout: 12000 });
  await page.mouse.move(640, 700);
  await page.screenshot({ path: output + "/void-player-first-frame.png" });
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  console.error(
    "Visible page:",
    (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 1600),
  );
  console.error("Browser errors:", errors.slice(0, 8));
  throw error;
} finally {
  await browser.close();
}
