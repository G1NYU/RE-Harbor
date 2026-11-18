// Run with a fresh browser profile against Harbor's Vite entry point.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
  genres: ["Drama"],
  description: "Two travelers cross paths on the last train home.",
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
  localStorage.setItem("harbor.installed-addons.void-test", JSON.stringify([{
    id: "void-smoke-addon",
    transportUrl: "https://void-preview.invalid/manifest.json",
    installedAt: Date.now(),
    manifest: {
      id: "void-smoke-addon",
      name: "VOID Preview Provider",
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
    { name: "VOID Preview Provider", title: "Night Train.2024.1080p.WEB-DL", url: "https://video-preview.invalid/1080.mp4" },
    { name: "VOID Preview Provider", title: "Night Train.2024.720p.WEBRip", url: "https://video-preview.invalid/720.mp4" },
  ] } : { id: "void-smoke-addon", name: "VOID Preview Provider", version: "1.0.0", resources: ["stream"], types: ["movie", "series"], idPrefixes: ["tt"] };
  await route.fulfill({ json: payload });
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:1420", { waitUntil: "domcontentloaded" });
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
  await page.keyboard.press("Escape");
  assert.equal(await actions.count(), 0, "Title dialog should close on Escape");
  assert.equal(await title.locator("h1").innerText(), film.name, "Escape must not navigate back from title");
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
  assert.match(await board.innerText(), /VOID Preview Provider/);
  assert.equal(await board.locator(".void-source-row").count(), 1);
  await board.getByText("Advanced filters", { exact: true }).click();
  assert.ok(await board.locator(".void-source-advanced select").count() >= 3);
  await page.screenshot({ path: `${output}/void-sources.png` });
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
