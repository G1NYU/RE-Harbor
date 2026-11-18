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
});
await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  const item = path.includes("/series/") ? series : film;
  await route.fulfill({ json: path.includes("/catalog/") ? { metas: [item] } : { meta: item } });
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
  await page.screenshot({ path: `${output}/series.png` });
  await nav.getByRole("button", { name: "Listen", exact: true }).click();
  await page.locator("[data-void-listening-deck]:visible").waitFor();
  await page.screenshot({ path: `${output}/listen.png` });
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
