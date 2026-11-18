import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("VOID 03 mounts a distinct Watch workspace on both film and series routes", () => {
  const app = read("src/App.tsx");
  const watch = read("src/views/void-studio/watch-workspace.tsx");
  assert.match(app, /const VoidWatchWorkspace = lazy/);
  assert.match(app, /<VoidWatchWorkspace kind="movies" active=\{moviesTop\}/);
  assert.match(app, /<VoidWatchWorkspace kind="shows" active=\{showsTop\}/);
  assert.match(watch, /data-void-watch/);
  assert.match(watch, /void-watch-stage/);
  assert.match(watch, /void-watch-filmstrip/);
  assert.match(watch, /void-watch-focus/);
  assert.doesNotMatch(watch, /<(?:CatalogRows|CinemaHero|Row|PickCard)(?:\s|\/|>)/);
});

test("Watch retrieves real catalog data and sends title actions to existing playback", () => {
  const watch = read("src/views/void-studio/watch-workspace.tsx");
  for (const id of ["movieSpecs", "showSpecs", "topMovies", "topSeries", "useSettings", "openMeta(item)", "Promise.allSettled"]) {
    assert.ok(watch.includes(id), `Missing ${id}`);
  }
  assert.match(watch, /onClick=\{\(\) => play\(focused\)\}/);
  assert.match(watch, /onClick=\{\(\) => play\(primary\)\}/);
  assert.match(watch, /onClick=\{\(\) => navigate\("movies"\)\}/);
  assert.match(watch, /onClick=\{\(\) => navigate\("shows"\)\}/);
});

test("Watch is responsive, flat and does not use expensive glass or animated layers", () => {
  const css = read("src/views/void-studio/void-watch.css");
  assert.match(css, /\.void-watch-stage\s*\{/);
  assert.match(css, /\.void-watch-filmstrip-expanded/);
  assert.match(css, /@media \(max-width: 740px\)/);
  assert.doesNotMatch(css, /backdrop-filter\s*:|filter\s*:\s*blur\(|@keyframes/);
});

test("Harbor Movies, Shows and Refract paths remain reachable outside VOID", () => {
  const app = read("src/App.tsx");
  assert.match(app, /voidShell\s*\?\s*\([\s\S]*?<VoidWatchWorkspace kind="movies"/);
  assert.match(app, /<Movies active=\{moviesTop\}/);
  assert.match(app, /<Shows active=\{showsTop\}/);
  assert.match(app, /<PlayerView/);
});

test("Watch retains parental gates and a source fallback without bypassing native routes", () => {
  const watch = read("src/views/void-studio/watch-workspace.tsx");
  assert.match(watch, /useSidebarNavigation/);
  assert.match(watch, /entry\.gated/);
  assert.match(watch, /ParentalPinModal/);
  assert.match(watch, /if \(!next\.length && specs\.some/);
  assert.match(watch, /setView\(target\)/);
});
