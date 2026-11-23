import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/index.css");
const lazy = read("src/components/lazy-mount.tsx");

test("lazy-wrapped rows avoid duplicate content-visibility culling", () => {
  assert.match(
    lazy,
    /contentVisibility:\s*"auto"/,
    "LazyMount remains the off-screen culling boundary",
  );
  assert.match(
    css,
    /\.harbor-row-shell\s*\{[^}]*content-visibility:\s*auto;/s,
    "standalone rows retain their existing culling behavior",
  );
  assert.match(
    css,
    /\.harbor-lazy-cull\s+\.harbor-row-shell\s*\{[^}]*content-visibility:\s*visible;/s,
    "a row inside LazyMount must not defer visibility a second time",
  );
  assert.ok(
    css.indexOf(".harbor-lazy-cull .harbor-row-shell") >
      css.indexOf(".harbor-row-shell[data-row-near]"),
    "the nested-row override must come after the equally specific near-row rule",
  );
});
