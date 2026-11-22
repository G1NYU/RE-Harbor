import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import * as icons from "lucide-react";
import ts from "typescript";

const dependencies = {
  react: React,
  "react-dom": ReactDOM,
  "react/jsx-runtime": jsxRuntime,
  "lucide-react": icons,
  "@/lib/keyboard-navigation": { advanceFocus: (el) => el.focus() },
  "@/lib/back-intercept": { pushBackHandler: () => () => {} },
  "@/lib/keyboard-navigation/geometry": {
    getDirection: (event) => ({ ArrowDown: "down", ArrowUp: "up" })[event.key],
    isBackKey: (event) => event.key === "Escape",
  },
};
const output = ts.transpileModule(
  readFileSync(new URL("../src/components/dropdown.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const exports = {};
new Function("require", "exports", output)((name) => {
  assert.ok(name in dependencies, name);
  return dependencies[name];
}, exports);
const { Dropdown } = exports;

for (const multiple of [false, true]) {
  test(`dropdown ${multiple ? "toggles multiple selections without closing" : "preserves single-selection closing"}`, async () => {
    const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
    Object.assign(globalThis, {
      window: dom.window,
      document: dom.window.document,
      getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
      requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
      cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.matchMedia = () => ({ matches: true });
    const root = createRoot(document.getElementById("root"));
    let latest;
    function Fixture() {
      const [selected, setSelected] = React.useState(["home"]);
      latest = selected;
      return React.createElement(Dropdown, {
        value: selected[0] ?? "",
        selectedValues: multiple ? selected : undefined,
        options: [
          { value: "home", label: "Home" },
          { value: "anime", label: "Anime" },
        ],
        onChange: (value) =>
          setSelected((prev) =>
            multiple
              ? prev.includes(value)
                ? prev.filter((v) => v !== value)
                : [...prev, value]
              : [value],
          ),
      });
    }
    try {
      await React.act(async () => root.render(React.createElement(Fixture)));
      const trigger = document.querySelector("button");
      await React.act(async () => trigger.click());
      const options = [...document.querySelectorAll('[role="option"]')];
      await React.act(async () => options[1].click());
      assert.deepEqual(latest, multiple ? ["home", "anime"] : ["anime"]);
      if (multiple) {
        assert.equal(
          document.querySelector('[role="listbox"]').getAttribute("aria-multiselectable"),
          "true",
        );
        assert.equal(document.querySelectorAll('[aria-selected="true"]').length, 2);
        await React.act(async () => options[0].click());
        assert.deepEqual(latest, ["anime"]);
        await React.act(async () =>
          options[1].dispatchEvent(
            new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          ),
        );
      }
      assert.equal(document.querySelector('[role="listbox"]'), null);
      assert.equal(document.activeElement, trigger);
    } finally {
      await React.act(async () => root.unmount());
      dom.window.close();
    }
  });
}

test("outside clicks dismiss a dropdown inside a modal even when bubbling is stopped", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.matchMedia = () => ({ matches: true });
  let ancestorScrolls = 0;
  dom.window.HTMLElement.prototype.scrollIntoView = () => ancestorScrolls++;
  const root = createRoot(document.getElementById("root"));
  function Fixture() {
    return React.createElement(
      "div",
      {
        role: "dialog",
        onMouseDown: (event) => event.stopPropagation(),
        onPointerDown: (event) => event.stopPropagation(),
      },
      React.createElement(Dropdown, {
        value: "reviews",
        selectedValues: ["reviews"],
        options: [
          { value: "reviews", label: "Written reviews" },
          { value: "activity", label: "Recent activity" },
        ],
        onChange: () => {},
      }),
      React.createElement("button", { id: "filter" }, "Filter"),
      React.createElement("div", { id: "space" }, "Empty area"),
    );
  }
  try {
    await React.act(() => root.render(React.createElement(Fixture)));
    const trigger = document.querySelector('[aria-haspopup="listbox"]');
    for (const [target, type] of [
      ["filter", "mousedown"],
      ["space", "pointerdown"],
      ["space", "click"],
    ]) {
      await React.act(() => trigger.click());
      assert.ok(document.querySelector('[role="listbox"]'));
      assert.equal(ancestorScrolls, 0, "opening scrolls only the popup contents");
      await React.act(() =>
        document
          .getElementById(target)
          .dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true })),
      );
      assert.equal(document.querySelector('[role="listbox"]'), null);
      assert.notEqual(
        document.activeElement,
        trigger,
        "outside clicks do not move focus back to the sort trigger",
      );
    }
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("dropdown follows modal layout changes and stays outside its trigger in short viewports", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  let top = 450;
  const observed = new Set();
  let notify;
  class Observer {
    constructor(callback) {
      notify = callback;
    }
    observe(element) {
      observed.add(element);
    }
    disconnect() {}
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    ResizeObserver: Observer,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(dom.window, "innerHeight", { value: 550, configurable: true });
  dom.window.matchMedia = () => ({ matches: true });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
    top,
    bottom: top + 36,
    left: 100,
    right: 300,
    width: 200,
    height: 36,
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return this.getAttribute("role") === "listbox" ? 128 : 0;
    },
  });
  const root = createRoot(document.getElementById("root"));
  try {
    await React.act(() =>
      root.render(
        React.createElement(
          "div",
          { role: "dialog" },
          React.createElement(Dropdown, {
            value: "reviews",
            options: [{ value: "reviews", label: "Written reviews" }],
            onChange: () => {},
          }),
        ),
      ),
    );
    await React.act(() => document.querySelector('[aria-haspopup="listbox"]').click());
    const menu = document.querySelector('[role="listbox"]');
    assert.ok(observed.has(document.querySelector('[role="dialog"]')));
    assert.ok(
      parseFloat(menu.style.top) + 128 <= top - 6,
      "popup opens above rather than covering a low trigger",
    );
    top = 150;
    await React.act(async () => {
      notify([]);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.equal(parseFloat(menu.style.top), top + 36 + 6, "popup follows the shifted modal");
    top = 50;
    Object.defineProperty(dom.window, "innerHeight", { value: 140, configurable: true });
    await React.act(async () => {
      dom.window.dispatchEvent(new dom.window.Event("resize"));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    assert.ok(
      parseFloat(menu.style.maxHeight) <= 40,
      "available space is respected instead of forcing a 120px popup",
    );
    assert.ok(parseFloat(menu.style.top) >= top + 36 + 6);
    assert.ok(parseFloat(menu.style.top) + parseFloat(menu.style.maxHeight) <= 132);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
    delete globalThis.ResizeObserver;
  }
});
