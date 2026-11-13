import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("desktop entry keeps the large awards dataset out of its eager module graph", () => {
  const entry = read("../src/main.tsx");
  assert.doesNotMatch(entry, /import ["']@\/lib\/awards-history-eager["']/);
  assert.match(entry, /import\(["']@\/lib\/awards-history["']\)/);
  assert.match(entry, /requestIdleCallback\(warmAwards/);
});

test("desktop entry does not await the native music DB before mounting React", () => {
  const entry = read("../src/main.tsx");
  assert.match(entry, /void initializeMusic\(\)/);
  const awaited = entry.match(/await Promise\.all\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
  assert.doesNotMatch(awaited, /initializeMusic/);
  assert.match(entry, /createRoot\(document\.getElementById\("root"\)!\)\.render/);
});

test("both desktop metadata pages respond when deferred awards become available", () => {
  for (const path of ["../src/views/detail.tsx", "../src/views/person.tsx"]) {
    const source = read(path);
    assert.match(source, /useBundledAwardsVersion\(\)/);
    assert.match(source, /\[awardsVersion, liveAwards,/);
  }
});

test("parked Home skips background library reconciliation until reactivated", () => {
  const home = read("../src/views/home.tsx");
  assert.match(home, /if \(!active\) return;\s*let cancelled = false;\s*const load = \(\) =>/);
  assert.match(home, /\[authKey, active, hideSharedCw\]/);
});
