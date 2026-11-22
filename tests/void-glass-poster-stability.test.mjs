import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";

const theme = readFileSync(
  new URL("../themes/VOID-Glass-Poster-Stable-1.0.4.harborstyle", import.meta.url),
  "utf8",
);
const css = theme.split("\n@css\n")[1]?.split("\n@html\n")[0] ?? "";
const html = theme.split("\n@html\n")[1]?.split("\n@js\n")[0] ?? "";
const js = theme.split("\n@js\n")[1] ?? "";

test("OG Glass package and script remain complete", () => {
  assert.match(theme, /^name: VOID Glass - Poster Stable$/m);
  assert.ok(css.length > 200_000);
  assert.ok(html.length > 10_000);
  assert.ok(js.length > 200_000);
  assert.match(html, /id="v-template"/);
  assert.match(js, /function openMusicFull\(\)/);
  assert.doesNotThrow(() => new Script(js));
});

test("the poster grid is not re-faded when navigating", () => {
  assert.match(css, /\[data-v-entering\] main \.harbor-hero-content\{animation:v-enter/);
  assert.doesNotMatch(css, /\[data-v-entering\] main\{animation:v-enter/);
  assert.doesNotMatch(css, /(?:html|body|:root):has\(/);
});

test("page observation excludes poster image and ARIA changes", () => {
  assert.match(js, /observer\.observe\(doc\.body,\{subtree:true,childList:true\}\)/);
  assert.doesNotMatch(js, /observer\.observe\(doc\.body,\{[^}]*attributes:true/);
  assert.match(js, /navObserver\.observe\(next,\{/);
  assert.match(js, /if\(navObserver\)navObserver\.disconnect\(\)/);
  assert.match(js, /t\.closest\('\.harbor-poster,\[data-media-card\]/);
});

test("Glass decorates service art without rewriting native images", () => {
  const match = /function tagBrands\(\)\{([\s\S]*?)\n\s*function clearOrder/.exec(js);
  assert.ok(match);
  const changes = [];
  const img = {
    getAttribute: (name) =>
      name === "src" ? "netflix.png" : name === "alt" ? "Netflix" : null,
    setAttribute: (name, value) => changes.push([name, value]),
  };
  const tile = {
    getAttribute: () => null,
    setAttribute: (name, value) => changes.push([name, value]),
    style: { setProperty: () => undefined },
  };
  const scope = {
    qa: () => [tile],
    q: () => img,
    brandOf: () => "netflix",
    BRAND_RGB: { netflix: "255,0,0" },
    BRAND_LOGO: { netflix: "brand-netflix.svg" },
  };
  new Script("function tagBrands(){" + match[1] + "\ntagBrands();").runInNewContext(
    scope,
    { timeout: 1000 },
  );
  assert.ok(changes.some(([name]) => name === "data-v-brand"));
  assert.ok(!changes.some(([name]) => name === "src"));
  assert.match(
    js,
    /img\.src=\(id&&BRAND_LOGO\[id\]\)\|\|im\.getAttribute\('src'\)/,
  );
});
