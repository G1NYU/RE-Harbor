import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { parseHarborCall } from "../src/lib/theme-markup-calls.ts";
import {
  buildChrome,
  DEFAULT_CHROME,
} from "../src/views/settings/theme-panel/theme-studio/chrome-config.ts";

function load(file: string, dependencies: Record<string, unknown>) {
  const output = ts.transpileModule(
    readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", output)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

test("only a single documented click action is read from an onclick attribute", () => {
  assert.deepEqual(parseHarborCall("window.harbor.navigate('home')"), {
    method: "navigate",
    text: "home",
  });
  assert.deepEqual(parseHarborCall('  harbor.navigate("live") ; '), {
    method: "navigate",
    text: "live",
  });
  assert.deepEqual(parseHarborCall("window.harbor.search()"), { method: "search" });
  assert.deepEqual(parseHarborCall("window.harbor.back();"), { method: "back" });
  assert.deepEqual(parseHarborCall("window.harbor.openAccountMenu(this)"), {
    method: "openAccountMenu",
    element: true,
  });
  // The quoted word is text, not the element.
  assert.deepEqual(parseHarborCall("window.harbor.navigate('this')"), {
    method: "navigate",
    text: "this",
  });

  for (const code of [
    null,
    "",
    "alert(1)",
    "alert(1); window.harbor.navigate('home')",
    "fetch(url).then(() => window.harbor.back())",
    "other.window.harbor.navigate('home')",
    "window.harbor.navigate('home'); alert(1)",
    "window.harbor.navigate('home') // note",
    "window.harbor.navigate(location.href)",
    "window.harbor.navigate('a', 'b')",
    "window.harbor.navigate('a' + b)",
    "window.harbor.navigate('it\\'s')",
    "window.harbor.navigate(`home`)",
    "window.harbor['navigate']('home')",
    "window.harbor.navigate('home').then(fetch)",
    "window.harbor.navigate(this.dataset.view)",
    "window.__TAURI__.invoke('x')",
    "harborX.navigate('home')",
    // Functions of window.harbor that are not click actions, or not part of it at all.
    "window.harbor.onUnread('x')",
    "window.harbor.unreadCount()",
    "window.harbor.constructor('x')",
    "window.harbor.toString()",
    "window.harbor.helperAThemeAdded('x')",
  ]) {
    assert.equal(parseHarborCall(code), null, String(code));
  }
});

async function fixture(markup: string) {
  // jsdom runs no inline handlers here, which is what the app's CSP does to them in a release build.
  const dom = new JSDOM(`${markup}<div id="root"></div>`, { url: "https://fixture.invalid" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    Element: dom.window.Element,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.setInterval = (() => 0) as unknown as typeof dom.window.setInterval;
  dom.window.clearInterval = (() => {}) as typeof dom.window.clearInterval;
  const errors: string[] = [];
  dom.window.addEventListener("error", (event) => errors.push(String(event.message)));

  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const harbor: Record<string, unknown> = {
    navigate: record("navigate"),
    search: record("search"),
    back: record("back"),
    bigPicture: record("bigPicture"),
    openAccountMenu: record("openAccountMenu"),
    onUnread: record("onUnread"),
    helperAThemeAdded: record("helperAThemeAdded"),
  };
  (dom.window as unknown as { harbor: Record<string, unknown> }).harbor = harbor;

  const nothing = () => null;
  const { ThemeChromeBridge } = load("components/theme-chrome-bridge.tsx", {
    react: React,
    "react-dom": ReactDOM,
    "react/jsx-runtime": jsxRuntime,
    "@/chrome/account-menu/account-menu-floating": { AccountMenuFloating: nothing },
    "@/chrome/sidebar/status-control": { StatusPicker: nothing },
    "@/components/notification-center/notification-center": { NotificationCenter: nothing },
    "@/lib/auth": { useAuth: () => ({ user: null }) },
    "@/lib/profiles": { useActiveKid: () => null, useProfiles: () => ({ activeProfile: null }) },
    "@/lib/settings": {
      useSettings: () => ({
        settings: { theme: { preset: "user:one" }, customHtml: "", harborAvatar: null },
      }),
    },
    "@/lib/nuvio/nuvio-client": { isNuvioProviderActive: () => false },
    "@/lib/social/account-menu-open": { anchorFromElement: nothing, openAccountMenu: nothing },
    "@/lib/social/notification-open": { openNotificationCenter: nothing },
    "@/lib/social/presence": {
      currentStatus: () => "online",
      setStatus: nothing,
      subscribeStatus: () => () => {},
    },
    "@/lib/social/unread-bridge": { getUnreadCount: () => 0, subscribeUnread: () => () => {} },
    "@/lib/theme": { activeLayout: () => "custom" },
    "@/lib/theme-markup-calls": load("lib/theme-markup-calls.ts", {}),
    "@/chrome/use-big-picture-entry": { useBigPictureEntry: () => ({ offer: true }) },
    "@/lib/theme-preview": { useThemePreview: () => null },
  }) as { ThemeChromeBridge: React.ComponentType };

  const root = createRoot(document.getElementById("root")!);
  await React.act(() => root.render(React.createElement(ThemeChromeBridge)));
  return {
    calls,
    errors,
    harbor,
    click: (selector: string) => {
      const el = document.querySelector(selector);
      assert.ok(el, `missing ${selector}`);
      // Not el.click(): an icon inside a button is an SVG node, and those have no click().
      el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    async close() {
      await React.act(() => root.unmount());
      dom.window.close();
    },
  };
}

test("a theme button wired with onclick reaches window.harbor although its handler is blocked", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="library" data-harbor-nav="library" onclick="window.harbor.navigate('library')"><svg><path id="icon"></path></svg><span>Library</span></button>
      <button id="search" onclick="window.harbor.search()">Search</button>
      <button id="back" onclick="window.harbor.back()">Back</button>
      <button id="account" onclick="window.harbor.openAccountMenu(this)">Account</button>
      <button id="own" data-harbor-account="own" onclick="window.harbor.navigate('settings')">Mine</button>
    </div>`);
  try {
    assert.equal(
      document.querySelector<HTMLElement>("#library")!.onclick,
      null,
      "the fixture must leave inline handlers blocked",
    );
    f.click("#library");
    f.click("#icon");
    f.click("#search");
    f.click("#back");
    f.click("#account");
    f.click("#own");
    assert.deepEqual(f.calls, [
      ["navigate", "library"],
      ["navigate", "library"],
      ["search"],
      ["back"],
      ["openAccountMenu", document.querySelector("#account")],
      ["navigate", "settings"],
    ]);
  } finally {
    await f.close();
  }
});

test("nothing else in an onclick attribute is acted on", async () => {
  const f = await fixture(`
    <button id="outside" onclick="window.harbor.navigate('home')">outside the theme markup</button>
    <div id="harbor-custom-overlay">
      <button id="other-code" onclick="alert(1)">x</button>
      <button id="two-statements" onclick="window.harbor.navigate('home'); alert(1)">x</button>
      <button id="code-first" onclick="alert(1); window.harbor.navigate('home')">x</button>
      <button id="not-a-click-action" onclick="window.harbor.onUnread('x')">x</button>
      <button id="added-by-a-theme" onclick="window.harbor.helperAThemeAdded('x')">x</button>
      <button id="constructor" onclick="window.harbor.constructor('x')">x</button>
      <button id="unknown" onclick="window.harbor.missing()">x</button>
    </div>`);
  try {
    for (const id of [
      "outside",
      "other-code",
      "two-statements",
      "code-first",
      "not-a-click-action",
      "added-by-a-theme",
      "constructor",
      "unknown",
    ]) {
      f.click(`#${id}`);
    }
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("a click action that is missing or not a function is skipped without an error", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="search" onclick="window.harbor.search()">Search</button>
      <button id="settings" onclick="window.harbor.openSettings()">Settings</button>
    </div>`);
  try {
    f.harbor.search = "not a function";
    f.click("#search");
    f.click("#settings");
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
});

test("a click action that window.harbor only inherits is not called", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="back" onclick="window.harbor.back()">Back</button>
    </div>`);
  try {
    const inherited: string[] = [];
    delete f.harbor.back;
    Object.setPrototypeOf(f.harbor, { back: () => inherited.push("back") });
    f.click("#back");
    assert.deepEqual(inherited, []);
    assert.deepEqual(f.calls, []);
  } finally {
    await f.close();
  }
});

test("only the node that held the theme markup at mount counts, not another one with its id", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="real" onclick="window.harbor.navigate('home')">real</button>
    </div>`);
  try {
    // Markup that reaches the page later and copies the id, placed before the real node.
    const copy = document.createElement("div");
    copy.id = "harbor-custom-overlay";
    copy.innerHTML = `<button id="copied" onclick="window.harbor.navigate('settings')">x</button>`;
    document.body.insertBefore(copy, document.body.firstChild);
    f.click("#copied");
    assert.deepEqual(f.calls, []);
    f.click("#real");
    assert.deepEqual(f.calls, [["navigate", "home"]]);
  } finally {
    await f.close();
  }
});

test("a handler the browser accepted is left to run by itself", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="live" onclick="window.harbor.navigate('live')">Live</button>
    </div>`);
  try {
    // Where no CSP applies the attribute compiles and the property is a function.
    let own = 0;
    document.querySelector<HTMLElement>("#live")!.onclick = () => {
      own += 1;
    };
    f.click("#live");
    assert.equal(own, 1);
    assert.deepEqual(f.calls, [], "the bridge must not call it a second time");
  } finally {
    await f.close();
  }
});

test("the click is honoured as late as a real handler would run, and not once it was stopped", async () => {
  const f = await fixture(`
    <div id="shell">
      <div id="harbor-custom-overlay">
        <button id="games" data-harbor-nav="games" onclick="window.harbor.navigate('games')">Games</button>
        <button id="plain" onclick="window.harbor.navigate('home')"><span id="inner">Home</span></button>
      </div>
    </div>`);
  try {
    // The shell intercepts some clicks in the capture phase and stops them, as App.tsx does for
    // the Games menu. An inline handler never saw those clicks.
    const order: string[] = [];
    document.querySelector("#shell")!.addEventListener(
      "click",
      (event) => {
        order.push("shell");
        if ((event.target as Element).closest('[data-harbor-nav="games"]')) event.stopPropagation();
      },
      true,
    );
    f.harbor.navigate = (view: string) => {
      order.push(`navigate ${view}`);
    };
    f.click("#games");
    f.click("#plain");
    assert.deepEqual(order, ["shell", "shell", "navigate home"]);

    // A listener on the way up that stops the click also stops the onclick above it.
    document.querySelector("#inner")!.addEventListener("click", (event) => event.stopPropagation());
    f.click("#inner");
    assert.deepEqual(order, ["shell", "shell", "navigate home", "shell"]);
  } finally {
    await f.close();
  }
});

test("a Harbor slot on the same element keeps its own behaviour", async () => {
  const f = await fixture(`
    <div id="harbor-custom-overlay">
      <button id="bp" data-harbor-bigpicture onclick="window.harbor.navigate('home')">Big Picture</button>
    </div>`);
  try {
    f.click("#bp");
    assert.deepEqual(f.calls, [["bigPicture"]]);
  } finally {
    await f.close();
  }
});

const onclicks = (markup: string) =>
  [...markup.matchAll(/onclick="([^"]*)"/g)].map((match) => match[1]);

test("every onclick Harbor itself hands to theme authors is one the bridge reads", async () => {
  const fromBuilder = [
    ...onclicks(buildChrome({ ...DEFAULT_CHROME, position: "topbar" }).html),
    ...onclicks(buildChrome({ ...DEFAULT_CHROME, position: "sidebar" }).html),
  ];
  assert.ok(fromBuilder.length >= 12, "the chrome builder wires its buttons with onclick");

  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  // Feishin's markup and the cheat-sheet recipes, with the one template placeholder filled in.
  const fromSources = onclicks(
    [
      read("../src/lib/theme.ts"),
      read("../src/views/settings/theme-panel/theme-studio/cheat-sheet-recipes.ts"),
    ]
      .join("\n")
      .replaceAll("${id}", "home"),
  );
  assert.ok(fromSources.length >= 20, "Feishin and the recipes wire their buttons with onclick");

  for (const code of [...fromBuilder, ...fromSources]) {
    assert.ok(parseHarborCall(code), `not readable by the bridge: ${code}`);
  }
});
