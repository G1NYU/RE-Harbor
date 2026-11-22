// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import ts from "typescript";
import { requestOpenProfile, subscribeOpenProfile } from "../src/lib/social/open-profile.ts";
import { WINDOW_HARBOR } from "../src/views/settings/theme-panel/theme-studio/cheat-sheet-data.ts";
import { createThemeDom } from "./helpers/elegantfin-dom.ts";

const appText = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const appSource = ts.createSourceFile(
  "App.tsx",
  appText,
  ts.ScriptTarget.ESNext,
  true,
  ts.ScriptKind.TSX,
);

function variableInitializer(name: string): string {
  let initializer: string | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      initializer = node.initializer.getText(appSource);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appSource);
  assert.ok(initializer, name + " initializer");
  return initializer;
}

function propertyInitializer(name: string): string {
  let initializer: string | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer.getText(appSource);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appSource);
  assert.ok(initializer, name + " property");
  return initializer;
}

function harborExposesShorthandProperty(name: string): boolean {
  let exposed = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(appSource) === "w.harbor" &&
      ts.isObjectLiteralExpression(node.right)
    ) {
      exposed = node.right.properties.some(
        (property) => ts.isShorthandPropertyAssignment(property) && property.name.text === name,
      );
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(appSource);
  return exposed;
}

type CurrentAuthor = () => { handle?: string | null } | null;

function buildTryViewMyProfile(currentAuthor: CurrentAuthor): () => boolean {
  return new Function(
    "currentAuthor",
    "requestOpenProfile",
    '"use strict"; return (' + variableInitializer("tryViewMyProfile") + ");",
  )(currentAuthor, requestOpenProfile) as () => boolean;
}

function buildViewMyProfile(
  tryViewMyProfile: () => boolean,
  fetchMe: () => Promise<unknown>,
): () => Promise<void> {
  return new Function(
    "tryViewMyProfile",
    "fetchMe",
    '"use strict"; return (' + propertyInitializer("viewMyProfile") + ");",
  )(tryViewMyProfile, fetchMe) as () => Promise<void>;
}

test("tryViewMyProfile returns false without a usable handle", () => {
  const opened: string[] = [];
  const unsubscribe = subscribeOpenProfile((handle) => opened.push(handle));
  try {
    for (const author of [null, { handle: null }, { handle: "" }, { handle: "   " }]) {
      assert.equal(buildTryViewMyProfile(() => author)(), false);
    }
    assert.deepEqual(opened, []);
  } finally {
    unsubscribe();
  }
});

test("tryViewMyProfile requests the normalized current handle once", () => {
  const opened: string[] = [];
  const unsubscribe = subscribeOpenProfile((handle) => opened.push(handle));
  try {
    assert.equal(buildTryViewMyProfile(() => ({ handle: "  Alice  " }))(), true);
    assert.deepEqual(opened, ["alice"]);
  } finally {
    unsubscribe();
  }
});

test("Harbor bridge exposes the immediate profile helper", () => {
  assert.equal(harborExposesShorthandProperty("tryViewMyProfile"), true);
});

test("viewMyProfile skips fetch when immediate navigation succeeds", async () => {
  let attempts = 0;
  let fetches = 0;
  const viewMyProfile = buildViewMyProfile(
    () => {
      attempts += 1;
      return true;
    },
    async () => {
      fetches += 1;
    },
  );

  await viewMyProfile();
  assert.equal(attempts, 1);
  assert.equal(fetches, 0);
});

test("viewMyProfile fetches once and retries the immediate helper", async () => {
  let ready = false;
  let attempts = 0;
  let fetches = 0;
  const viewMyProfile = buildViewMyProfile(
    () => {
      attempts += 1;
      return ready;
    },
    async () => {
      fetches += 1;
      ready = true;
    },
  );

  await viewMyProfile();
  assert.equal(attempts, 2);
  assert.equal(fetches, 1);
});

test("viewMyProfile preserves the swallowed fetch-failure contract", async () => {
  let attempts = 0;
  const viewMyProfile = buildViewMyProfile(
    () => {
      attempts += 1;
      return false;
    },
    async () => {
      throw new Error("offline");
    },
  );

  await assert.doesNotReject(viewMyProfile());
  assert.equal(attempts, 2);
});

test("Theme Studio documents the immediate boolean profile API", () => {
  assert.deepEqual(
    WINDOW_HARBOR.find((entry) => entry.call === "window.harbor.tryViewMyProfile()"),
    {
      call: "window.harbor.tryViewMyProfile()",
      desc: "Open the signed-in user's own Harbor profile immediately when its handle is loaded. Returns true when navigation starts and false otherwise.",
    },
  );
});

type ImmediateApi = { tryViewMyProfile?: () => unknown };

function elegantFinScript(): string {
  const themeText = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  const themeSource = ts.createSourceFile(
    "theme.ts",
    themeText,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  let script: string | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "buildElegantFinJs" && node.body) {
      const returned = node.body.statements.find(ts.isReturnStatement)?.expression;
      assert.ok(returned && ts.isTemplateExpression(returned), "ElegantFin generated template");
      script = returned.head.text;
      for (const span of returned.templateSpans) {
        const expression = span.expression.getText(themeSource);
        const key = /^JSON\.stringify\(t\("([^"]+)"\)\)$/.exec(expression)?.[1];
        assert.ok(key, `unsupported ElegantFin template expression: ${expression}`);
        script += JSON.stringify(key) + span.literal.text;
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(themeSource);
  assert.ok(script, "ElegantFin generated script");
  return script;
}

function mountElegantFin(api?: ImmediateApi, collapsed = false) {
  const dom = createThemeDom(`
    <header class="fixed inset-x-0 top-0"><div>
      <div data-harbor-topbar-leading><button id="native-back" class="rounded-lg">Back</button></div>
      <div><button data-harbor-search class="harbor-search-pill">Search</button></div>
      <div data-harbor-topbar-actions><div class="ms-1"></div></div>
    </div></header>
    <div data-harbor-shell>
      <aside data-harbor-sidebar data-collapsed="${collapsed}" aria-hidden="false">
        <div>Harbor</div><nav><button data-harbor-nav="home">Home</button></nav>
        <div><div><button data-harbor-sidebar-toggle><svg><path></path></svg></button></div>
          <div class="relative"><div class="h-12 w-12 rounded-full"><img src="/avatar.png"></div></div>
        </div>
      </aside>
    </div>
    <div id="ef-topleft"><button id="ef-menu">Menu</button></div><div id="ef-scrim"></div>
  `);
  const themeWindow = dom.window as typeof dom.window & {
    harbor?: ImmediateApi;
    __efChromeCleanup?: () => void;
    __harborThemeCleanup?: () => void;
  };
  themeWindow.harbor = api;
  new Function("window", "document", "MutationObserver", "Element", elegantFinScript())(
    themeWindow,
    dom.document,
    dom.Observer,
    dom.Element,
  );
  dom.flush();
  const root = dom.document.documentElement;
  const sidebar = dom.document.querySelector("[data-harbor-sidebar]")!;
  return {
    ...dom,
    sidebar,
    drawerOpen: () => root.classList.contains("ef-drawer-open"),
    setDrawerOpen: (open: boolean) => root.classList.toggle("ef-drawer-open", open),
    facts: (names: string[]) => names.filter((name) => root.classList.contains(name)),
    // Counts document-wide searches from now on; returns a reader for the count.
    countDocumentSearches: () => {
      let count = 0;
      const search = dom.document.querySelector;
      dom.document.querySelector = (selector: string) => {
        count += 1;
        return search(selector);
      };
      return () => count;
    },
    cleanup: () => themeWindow.__harborThemeCleanup?.(),
    clickListenerCount: () => dom.listeners("click"),
    keyListenerCount: () => dom.listeners("keydown"),
    intervalWasCleared: () => dom.pendingIntervals() === 0,
  };
}

test("ElegantFin menu remains the independent drawer toggle", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), true);
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin cleanup removes drawer state and listeners", () => {
  const harness = mountElegantFin({});
  harness.setDrawerOpen(true);
  harness.cleanup();
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.clickListenerCount(), 0);
  assert.equal(harness.keyListenerCount(), 0);
  assert.equal(harness.intervalWasCleared(), true);
  assert.equal(harness.activeObservers(), 0);
  assert.equal(harness.document.querySelector("#ef-profile"), null);
  assert.equal(harness.document.querySelector("#ef-search"), null);
  harness.click("#ef-menu");
  assert.equal(harness.drawerOpen(), false);
});

test("ElegantFin Collapse reaches the native settings handler and dismisses the drawer", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  let nativeCalls = 0;
  const event = harness.click("[data-harbor-sidebar-toggle] path", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "true");
  });
  assert.equal(nativeCalls, 1);
  assert.equal(event.propagationStopped, false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  harness.cleanup();
});

test("ElegantFin Expand reaches the native settings handler and opens the full drawer", () => {
  const harness = mountElegantFin({}, true);
  let nativeCalls = 0;
  harness.click("[data-harbor-sidebar-toggle] path", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "false");
  });
  assert.equal(nativeCalls, 1);
  assert.equal(harness.drawerOpen(), true);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "false");
  harness.cleanup();
});

test("ElegantFin observes a collapse setting change while the drawer is open", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.setAttribute("data-collapsed", "true");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin Games list collapse and expand never open the Harbor drawer", () => {
  const harness = mountElegantFin({});
  const shell = harness.document.querySelector("[data-harbor-shell]")!;
  shell.setAttribute("data-games-library", "");

  // The Games list and Harbor sidebar share the saved collapsed preference.
  harness.sidebar.setAttribute("data-collapsed", "true");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);

  harness.sidebar.setAttribute("data-collapsed", "false");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin reserves its pinned rail only outside the Games workspace", () => {
  const themeSource = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  assert.match(
    themeSource,
    /html\.ef-sidebar-rail:not\(\.ef-games\) \{\s*--ef-rail-space: var\(--ef-rail-width\);/,
  );
  const harness = mountElegantFin({}, true);
  const shell = harness.document.querySelector("[data-harbor-shell]")!;
  assert.deepEqual(harness.facts(["ef-sidebar-rail", "ef-games"]), ["ef-sidebar-rail"]);
  shell.setAttribute("data-games-library", "");
  harness.flush();
  assert.deepEqual(harness.facts(["ef-sidebar-rail", "ef-games"]), ["ef-sidebar-rail", "ef-games"]);
  shell.removeAttribute("data-games-library");
  harness.flush();
  assert.deepEqual(harness.facts(["ef-sidebar-rail", "ef-games"]), ["ef-sidebar-rail"]);
  harness.cleanup();
});

const ELEGANTFIN_FACTS = [
  "ef-games",
  "ef-sidebar",
  "ef-sidebar-shown",
  "ef-sidebar-rail",
  "ef-sidebar-collapsed",
  "ef-sidebar-expanded",
  "ef-topbar",
];

test("ElegantFin keeps the page facts its CSS reads as classes on html", () => {
  const harness = mountElegantFin({});
  const facts = () => harness.facts(ELEGANTFIN_FACTS);
  assert.deepEqual(facts(), ["ef-sidebar", "ef-sidebar-shown", "ef-sidebar-expanded", "ef-topbar"]);

  harness.sidebar.setAttribute("data-collapsed", "true");
  harness.flush();
  assert.deepEqual(facts(), [
    "ef-sidebar",
    "ef-sidebar-shown",
    "ef-sidebar-rail",
    "ef-sidebar-collapsed",
    "ef-topbar",
  ]);

  harness.sidebar.setAttribute("aria-hidden", "true");
  harness.flush();
  assert.deepEqual(facts(), ["ef-sidebar", "ef-sidebar-collapsed", "ef-topbar"]);

  harness.sidebar.remove();
  harness.flush();
  assert.deepEqual(facts(), ["ef-topbar"]);

  harness.document.querySelector("header")!.remove();
  harness.flush();
  assert.deepEqual(facts(), []);
  harness.cleanup();
});

test("ElegantFin picks up a sidebar that mounts elsewhere in the page", () => {
  const harness = mountElegantFin({});
  harness.sidebar.remove();
  harness.flush();
  assert.deepEqual(harness.facts(["ef-sidebar", "ef-sidebar-shown"]), []);

  // Settings brings its own sidebar, deeper in the page than the shell's one.
  const page = harness.document.createElement("section");
  const settingsSidebar = harness.document.createElement("aside");
  settingsSidebar.setAttribute("data-harbor-sidebar", "");
  page.appendChild(settingsSidebar);
  harness.document.querySelector("[data-harbor-shell]")!.appendChild(page);
  harness.flush();
  assert.deepEqual(harness.facts(["ef-sidebar", "ef-sidebar-shown"]), [
    "ef-sidebar",
    "ef-sidebar-shown",
  ]);
  harness.cleanup();
});

test("ElegantFin leaves the document alone while unrelated nodes come and go", () => {
  const harness = mountElegantFin({});
  const page = harness.document.createElement("main");
  harness.document.querySelector("[data-harbor-shell]")!.appendChild(page);
  harness.flush();
  const searches = harness.countDocumentSearches();

  // What scrolling does all the time: cards are added, change and are removed again.
  const card = harness.document.createElement("div");
  card.appendChild(harness.document.createElement("button"));
  page.appendChild(card);
  card.setAttribute("class", "harbor-poster");
  card.setAttribute("aria-hidden", "true");
  card.remove();
  harness.flush();
  assert.equal(searches(), 0);

  page.appendChild(harness.document.createElement("header"));
  harness.flush();
  assert.ok(searches() > 0, "a node the facts depend on must trigger a fresh look");
  harness.cleanup();
});

test("ElegantFin cleanup takes its fact classes off html", () => {
  const harness = mountElegantFin({}, true);
  assert.ok(harness.facts(ELEGANTFIN_FACTS).length > 0);
  harness.cleanup();
  assert.deepEqual(harness.facts(ELEGANTFIN_FACTS), []);
  assert.equal(harness.activeObservers(), 0);
});

test("ElegantFin notices a top bar that stops being one", () => {
  const harness = mountElegantFin({});
  assert.deepEqual(harness.facts(["ef-topbar"]), ["ef-topbar"]);
  // header.fixed.inset-x-0.top-0 is the question; a header without one of the classes is not it.
  harness.document.querySelector("header")!.setAttribute("class", "inset-x-0 top-0");
  harness.flush();
  assert.deepEqual(harness.facts(["ef-topbar"]), []);
  harness.document.querySelector("header")!.setAttribute("class", "fixed inset-x-0 top-0");
  harness.flush();
  assert.deepEqual(harness.facts(["ef-topbar"]), ["ef-topbar"]);
  harness.cleanup();
});

test("ElegantFin's CSS reads exactly the state classes its script keeps", () => {
  // A class the CSS reads and the script never sets would switch a rule off for good.
  const themeSource = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  const css = themeSource.slice(
    themeSource.indexOf("const elegantFinCss = `"),
    themeSource.indexOf("function buildElegantFinHtml"),
  );
  const read = new Set<string>();
  for (const rule of css.matchAll(/^html[^\s{,]*/gm)) {
    for (const name of rule[0].matchAll(/\.(ef-[a-z-]+)/g)) read.add(name[1]);
  }
  assert.deepEqual([...read].sort(), [...ELEGANTFIN_FACTS, "ef-drawer-open"].sort());

  const script = elegantFinScript();
  for (const name of ELEGANTFIN_FACTS) {
    assert.ok(script.includes(`["${name}", `), `the script must keep ${name}`);
  }
});

test("ElegantFin releases the scrim state when navigation unmounts the sidebar", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.remove();
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin releases the scrim state when playback hides the sidebar", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.sidebar.setAttribute("aria-hidden", "true");
  harness.flush();
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin makes only the hidden drawer inert and restores focusability on cleanup", () => {
  const harness = mountElegantFin({});
  assert.equal(harness.sidebar.inert, true);
  harness.click("#ef-menu");
  assert.equal(harness.sidebar.inert, false);
  harness.click("#ef-scrim");
  assert.equal(harness.sidebar.inert, true);
  harness.cleanup();
  assert.equal(harness.sidebar.inert, false);
});

test("ElegantFin keeps collapsed navigation focusable without an open drawer", () => {
  const harness = mountElegantFin({}, true);
  assert.equal(harness.sidebar.inert, false);
  harness.key("Escape");
  assert.equal(harness.sidebar.inert, false);
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin hands the revealed Games navigation back to the shell", () => {
  const harness = mountElegantFin({});
  const shell = harness.document.querySelector("[data-harbor-shell]")!;
  assert.equal(harness.sidebar.inert, true);
  shell.setAttribute("data-games-navigation", "");
  harness.flush();
  assert.equal(harness.sidebar.inert, false);
  assert.equal(harness.drawerOpen(), false);
  shell.removeAttribute("data-games-navigation");
  harness.flush();
  assert.equal(harness.sidebar.inert, true);
  harness.cleanup();
});

test("ElegantFin yields its corner menu and drawer to the Games workspace", () => {
  const themeSource = readFileSync(new URL("../src/lib/theme.ts", import.meta.url), "utf8");
  assert.match(themeSource, /html\.ef-games #ef-topleft \{\s*display: none !important;/);
  const harness = mountElegantFin({});
  harness.document.querySelector("[data-harbor-shell]")!.setAttribute("data-games-library", "");
  harness.flush();
  assert.deepEqual(harness.facts(["ef-games"]), ["ef-games"]);
  harness.cleanup();
  assert.match(
    themeSource,
    /\[data-games-library\]\[data-games-navigation\][\s\S]{0,200}aside\[data-harbor-sidebar\] \{\s*transform: translateX\(0\) !important;[\s\S]{0,200}visibility: visible !important;/,
  );
  assert.match(
    themeSource,
    /html\.ef-drawer-open \[data-games-library\]:not\(\[data-games-navigation\]\)[\s\S]{0,160}aside\[data-harbor-sidebar\] \{\s*translate: 0 !important;[\s\S]{0,200}visibility: visible !important;/,
  );
});

test("ElegantFin Escape returns focus from the closed drawer to its menu button", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-menu");
  harness.document.querySelector("[data-harbor-sidebar-toggle]")!.focus();
  harness.key("Escape");
  assert.equal(harness.drawerOpen(), false);
  assert.equal(harness.document.activeElement.id, "ef-menu");
  harness.cleanup();
});

test("ElegantFin Escape preserves focus inside the pinned rail", () => {
  const harness = mountElegantFin({}, true);
  const toggle = harness.document.querySelector("[data-harbor-sidebar-toggle]")!;
  toggle.focus();
  harness.key("Escape");
  assert.equal(harness.document.activeElement === toggle, true);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin keeps the collapsed rail setting when Escape or navigation dismisses a drawer", () => {
  const harness = mountElegantFin({}, true);
  harness.key("Escape");
  harness.click("[data-harbor-nav]");
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "true");
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin synchronizes one profile action when the native header is remounted", () => {
  const harness = mountElegantFin({});
  harness.document.querySelector("[data-harbor-topbar-actions]")!.innerHTML =
    '<div class="ms-1"></div>';
  harness.tick();
  assert.equal(harness.document.querySelectorAll("#ef-profile").length, 1);
  assert.equal(harness.document.querySelectorAll("#ef-search").length, 1);
  assert.equal(
    harness.document.querySelector("#ef-profile img")?.getAttribute("src"),
    "/avatar.png",
  );
  harness.cleanup();
});

test("ElegantFin avatar closes the drawer when immediate navigation succeeds", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      return true;
    },
  });
  harness.setDrawerOpen(true);
  harness.click("#ef-profile");
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), false);
  harness.cleanup();
});

test("ElegantFin avatar opens the drawer when no loaded profile is available", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      return false;
    },
  });
  harness.click("#ef-profile");
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin avatar expands the pinned rail through the native handler when profile navigation fails", () => {
  const harness = mountElegantFin({ tryViewMyProfile: () => false }, true);
  let nativeCalls = 0;
  harness.bindClick("[data-harbor-sidebar-toggle]", () => {
    nativeCalls += 1;
    harness.sidebar.setAttribute("data-collapsed", "false");
  });
  harness.click("#ef-profile");
  assert.equal(nativeCalls, 1);
  assert.equal(harness.sidebar.getAttribute("data-collapsed"), "false");
  assert.equal(harness.drawerOpen(), true);
  assert.equal(harness.sidebar.inert, false);
  harness.cleanup();
});

test("ElegantFin avatar falls back when the immediate API is missing", () => {
  const harness = mountElegantFin({});
  harness.click("#ef-profile");
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin avatar catches immediate API failures and opens the drawer", () => {
  let calls = 0;
  const harness = mountElegantFin({
    tryViewMyProfile: () => {
      calls += 1;
      throw new Error("broken bridge");
    },
  });
  assert.doesNotThrow(() => harness.click("#ef-profile"));
  assert.equal(calls, 1);
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});

test("ElegantFin treats non-boolean API results as drawer fallback", () => {
  const harness = mountElegantFin({
    tryViewMyProfile: () => "not-the-boolean-contract",
  });
  harness.click("#ef-profile");
  assert.equal(harness.drawerOpen(), true);
  harness.cleanup();
});
