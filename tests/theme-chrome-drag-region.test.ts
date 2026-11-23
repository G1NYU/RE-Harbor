import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "cheerio";
import {
  buildChrome,
  DEFAULT_CHROME,
} from "../src/views/settings/theme-panel/theme-studio/chrome-config.ts";
import { RECIPES } from "../src/views/settings/theme-panel/theme-studio/cheat-sheet-recipes.ts";

type El = { type: string; name: string; attribs: Record<string, string>; parent: El | null };

// The rule of Tauri 2.12's window drag script (src/window/scripts/drag.js, isDragRegion): walking
// from the pressed element upward, a clickable element without the mark blocks the drag, "deep"
// drags from anywhere inside, a bare mark only from the element itself, "false" blocks.
const CLICKABLE = new Set(["a", "button", "input", "select", "textarea", "label", "summary"]);
const ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "option",
]);
const isHtmlElement = (el: El) => {
  if (el.type !== "tag") return false;
  // The script skips nodes that are not HTMLElement: an <svg> and everything drawn inside it.
  for (let up: El | null = el; up; up = up.parent) if (up.name === "svg") return false;
  return true;
};
const clickable = (el: El) =>
  CLICKABLE.has(el.name) ||
  ("contenteditable" in el.attribs && el.attribs.contenteditable !== "false") ||
  ("tabindex" in el.attribs && el.attribs.tabindex !== "-1") ||
  ROLES.has(el.attribs.role);
function dragsFrom(target: El): boolean {
  for (let el: El | null = target; el; el = el.parent) {
    if (!isHtmlElement(el)) continue;
    const mark = el.attribs["data-tauri-drag-region"] ?? null;
    if (clickable(el) && mark === null) return false;
    if (mark === null) continue;
    if (mark === "false") return false;
    if (mark === "deep") return true;
    if (mark === "" || mark === "true") return el === target;
  }
  return false;
}

function everyElement(html: string): { all: El[]; find: (selector: string) => El[] } {
  const $ = load(html, null, false);
  return {
    all: $("*").toArray() as unknown as El[],
    find: (selector) => $(selector).toArray() as unknown as El[],
  };
}
const insideButton = (el: El) => {
  for (let up: El | null = el; up; up = up.parent) if (up.name === "button") return true;
  return false;
};

test("the drag rule used here is the one Tauri's drag script applies", () => {
  const page = everyElement(`
    <div id="bare" data-tauri-drag-region><span id="in-bare"></span></div>
    <div id="deep" data-tauri-drag-region="deep"><span id="in-deep"></span><button id="button"><i id="in-button"></i></button><svg id="svg"><path id="path"></path></svg></div>
    <div id="off" data-tauri-drag-region="deep"><div data-tauri-drag-region="false"><span id="in-off"></span></div></div>
    <div id="other" data-tauri-drag-region="1"></div>
    <div id="plain"></div>`);
  const drags = Object.fromEntries(page.all.map((el) => [el.attribs.id, dragsFrom(el)]));
  assert.deepEqual(drags, {
    bare: true,
    "in-bare": false,
    deep: true,
    "in-deep": true,
    button: false,
    "in-button": false,
    svg: true,
    path: true,
    off: true,
    undefined: false,
    "in-off": false,
    other: false,
    plain: false,
  });
});

for (const position of ["topbar", "sidebar"] as const) {
  test(`the window can be dragged by builder-made ${position} chrome, but not by its buttons`, () => {
    const page = everyElement(
      buildChrome({
        ...DEFAULT_CHROME,
        position,
        icons: { home: "data:image/png;base64,AAAA", movies: "film" },
        labels: { shows: "Series" },
      }).html,
    );
    assert.equal(page.find(position === "topbar" ? "header.myc-bar" : "aside.myc-rail").length, 1);
    for (const part of [".myc-brand", ".myc-nav", ".myc-spacer", ".myc-quick"]) {
      assert.equal(page.find(part).length, 1, part);
    }
    assert.ok(page.find("button").length >= 9);
    assert.ok(page.find("button img.myc-ico").length >= 1, "a button with an icon and a label");
    for (const el of page.all) {
      const where = `<${el.name} class="${el.attribs.class ?? ""}">`;
      if (insideButton(el)) assert.equal(dragsFrom(el), false, `${where} is part of a button`);
      else assert.equal(dragsFrom(el), true, `${where} must drag the window`);
    }
  });

  test(`${position} chrome without a brand can still be dragged`, () => {
    const page = everyElement(buildChrome({ ...DEFAULT_CHROME, position, brand: " " }).html);
    assert.equal(page.find(".myc-brand").length, 0);
    for (const el of page.find(".myc-bar, .myc-rail, .myc-spacer, .myc-nav")) {
      assert.equal(dragsFrom(el), true);
    }
  });
}

test("the recipe that replaces the built-in chrome keeps a way to drag the window", () => {
  const replacing = RECIPES.filter((recipe) => /<(aside|header)\b/.test(recipe.code));
  assert.equal(replacing.length, 1, "the custom sidebar recipe");
  const page = everyElement(replacing[0].code);
  assert.equal(page.find("aside").length, 1);
  for (const el of page.all) {
    assert.equal(dragsFrom(el), !insideButton(el), `<${el.name}> in the recipe`);
  }
});

test("Feishin's action bar drags the window, its scrolling list does not", () => {
  const theme = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  const start = theme.indexOf("function buildFeishinHtml");
  const markup = theme
    .slice(theme.indexOf("`", start) + 1, theme.indexOf("function buildFeishinJs"))
    .replace(/\$\{[^}]*\}/g, "x");
  const page = everyElement(markup);
  const [bar] = page.find(".fsh-actionbar");
  const [list] = page.find(".fsh-scroll");
  assert.ok(bar && list, "the action bar and the list");
  assert.equal(dragsFrom(bar), true);
  for (const el of page.find(".fsh-actionbar *")) {
    assert.equal(
      dragsFrom(el),
      !insideButton(el),
      `<${el.name} class="${el.attribs.class ?? ""}">`,
    );
  }
  // A press on the list must stay a press on the list: it has a scrollbar to drag.
  assert.equal(dragsFrom(list), false);
});
