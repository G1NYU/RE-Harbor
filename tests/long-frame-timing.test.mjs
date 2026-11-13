import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/long-frame-timing.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function("module", "exports", js)(module, module.exports);
const { longFrameBreakdown } = module.exports;

test("browser pre-layout render callbacks are not mislabeled as style/layout", () => {
  const result = longFrameBreakdown({
    startTime: 1000,
    duration: 350,
    renderStart: 1010,
    styleAndLayoutStart: 1340,
    scripts: [{ forcedStyleAndLayoutDuration: 2 }, { forcedStyleAndLayoutDuration: 0 }],
  });
  assert.deepEqual(result, {
    beforeRenderMs: 10,
    renderCallbacksMs: 330,
    styleLayoutAndPaintMs: 10,
    forcedLayoutMs: 2,
  });
});

test("a frame dominated by late layout/paint is reported in the render tail", () => {
  const result = longFrameBreakdown({
    startTime: 100,
    duration: 200,
    renderStart: 105,
    styleAndLayoutStart: 110,
  });
  assert.equal(result.beforeRenderMs, 5);
  assert.equal(result.renderCallbacksMs, 5);
  assert.equal(result.styleLayoutAndPaintMs, 190);
});

test("a non-rendering long task has no invented layout or painting time", () => {
  const result = longFrameBreakdown({ startTime: 100, duration: 160, renderStart: 0 });
  assert.deepEqual(result, {
    beforeRenderMs: 160,
    renderCallbacksMs: 0,
    styleLayoutAndPaintMs: 0,
    forcedLayoutMs: 0,
  });
});

test("missing style boundary is accounted for as rendering callbacks, not paint", () => {
  const result = longFrameBreakdown({ startTime: 100, duration: 60, renderStart: 110 });
  assert.deepEqual(result, {
    beforeRenderMs: 10,
    renderCallbacksMs: 50,
    styleLayoutAndPaintMs: 0,
    forcedLayoutMs: 0,
  });
});

test("invalid timing boundaries and oversized forced-layout attribution stay bounded", () => {
  const result = longFrameBreakdown({
    startTime: 100,
    duration: 50,
    renderStart: 500,
    styleAndLayoutStart: 505,
    scripts: [{ forcedStyleAndLayoutDuration: 300 }, { forcedStyleAndLayoutDuration: -2 }],
  });
  assert.deepEqual(result, {
    beforeRenderMs: 50,
    renderCallbacksMs: 0,
    styleLayoutAndPaintMs: 0,
    forcedLayoutMs: 50,
  });
});

test("poster and rail code uses measured sizes and batches visibility checks", () => {
  const poster = readFileSync(new URL("../src/components/poster.tsx", import.meta.url), "utf8");
  assert.match(poster, /return observeResize\(el, \(box\) =>/);
  assert.doesNotMatch(poster, /const box = el\.getBoundingClientRect\(\)/);
  const row = readFileSync(new URL("../src/components/row.tsx", import.meta.url), "utf8");
  assert.match(row, /const recheckBatches = new WeakMap/);
  assert.match(row, /scheduleVisibilityRecheck\(root, el, \(\) => setVisible\(true\)\)/);
  assert.match(row, /now - lastRevealAt >= 16/);
});
