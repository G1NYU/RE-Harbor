import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";

const path = new URL("../themes/VOID-Glass-Poster-Stable-1.0.4.harborstyle", import.meta.url);
const theme = readFileSync(path, "utf8");
const css = theme.split("\n@css\n")[1]?.split("\n@html\n")[0] ?? "";
const html = theme.split("\n@html\n")[1]?.split("\n@js\n")[0] ?? "";
const js = theme.split("\n@js\n")[1] ?? "";

test("OG Glass package and JavaScript remain complete", () => {
  assert.match(theme, /^name: VOID Glass - Poster Stable$/m);
  assert.ok(css.length > 200_000);
  assert.ok(html.length > 10_000);
  assert.ok(js.length > 200_000);
  assert.ok(html.includes('id="v-template"'));
  assert.ok(js.includes("function openMusicFull()"));
  assert.doesNotThrow(() => new Script(js));
});

test("navigating no longer re-fades the poster grid", () => {
  assert.ok(css.includes("[data-v-entering] main .harbor-hero-content{animation:v-enter"));
  assert.ok(!css.includes("[data-v-entering] main{animation:v-enter"));
  assert.doesNotMatch(css, /(?:html|body|:root):has\(/);
});

test("document observer excludes poster attributes and cleans up", () => {
  assert.ok(js.includes("observer.observe(doc.body,{subtree:true,childList:true})"));
  assert.ok(!js.includes("observer.observe(doc.body,{attributes:true"));
  assert.ok(js.includes("navObserver.observe(next,{"));
  assert.ok(js.includes("if(navObserver)navObserver.disconnect()"));
  assert.ok(js.includes("t.closest('.harbor-poster,[data-media-card]"));
});

test("native service images remain owned by Harbor", () => {
  const start = js.indexOf("function tagBrands(){");
  const end = js.indexOf("function clearOrder", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const tagBrands = js.slice(start, end);
  assert.ok(tagBrands.includes("tile.setAttribute('data-v-brand'"));
  assert.ok(!tagBrands.includes("im.setAttribute('src'"));
  assert.ok(js.includes("img.src=(id&&BRAND_LOGO[id])||im.getAttribute('src')"));
});
