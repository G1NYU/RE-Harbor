import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function load(path, mocks, globals = {}) {
  const { outputText } = ts.transpileModule(read(path), {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), outputText)(
    (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
    ...Object.values(globals),
  );
  return module.exports;
}

// React's effect bookkeeping, as far as a runner depends on it: an effect runs on the first
// render and again, after its cleanup, whenever one of its dependencies has changed.
function hooks() {
  const slots = [];
  let cursor = 0;
  const slot = (initial) => (slots[cursor++] ??= initial());
  return {
    module: {
      useEffect(effect, dependencies) {
        const state = slot(() => ({}));
        const previous = state.dependencies;
        if (
          previous &&
          previous.length === dependencies.length &&
          previous.every((value, index) => Object.is(value, dependencies[index]))
        )
          return;
        if (typeof state.cleanup === "function") state.cleanup();
        state.dependencies = dependencies;
        state.cleanup = effect();
      },
      useRef: (current) => slot(() => ({ current })),
    },
    render(component) {
      cursor = 0;
      return component();
    },
  };
}

// The install store publishes a new object when the native answer arrives, so the tests swap
// the object the same way instead of changing it in place.
const installation = (features) => ({ current: features });

const profiles = { useProfiles: () => ({ activeId: "profile" }) };
const mainWindow = { getCurrentWindow: () => ({ label: "main" }) };
const translate = { useT: () => (key) => key };

function downloadNotifications(installed) {
  const react = hooks();
  const calls = { watched: [], stopped: 0, listed: [], stillCurrent: null };
  const { GameDownloadNotificationsRunner } = load(
    "src/lib/games/download-notifications-runner.tsx",
    {
      react: react.module,
      "@tauri-apps/api/core": {
        invoke: async (command) => {
          calls.listed.push(command);
          return [];
        },
        isTauri: () => true,
      },
      "@tauri-apps/api/event": { listen: async () => () => {} },
      "@tauri-apps/api/window": mainWindow,
      "@/lib/features/install": { useInstallFeatures: () => installed.current },
      "@/lib/profiles": profiles,
      "@/lib/i18n": translate,
      "@/lib/platform": { osClass: () => "windows" },
      "./download-context": { mergeDownloadContext: (_kind, record) => record },
      "./download-completions": {
        watchDownloadCompletions: (profile, feed) => {
          calls.watched.push(profile);
          void feed.list("http");
          return () => calls.stopped++;
        },
      },
      "./game-completion-gate": {
        createGameCompletionGate: (_profile, _list, _notify, _storage, isCurrent) => {
          calls.stillCurrent = isCurrent;
          return { check: async () => {} };
        },
      },
    },
    { localStorage: null },
  );
  return { calls, render: () => react.render(GameDownloadNotificationsRunner) };
}

function sourceAlerts(installed) {
  const react = hooks();
  const calls = {
    subscribed: [],
    unsubscribed: [],
    listeners: [],
    removed: [],
    timers: [],
    cleared: [],
  };
  const subscribe = (name) => () => {
    calls.subscribed.push(name);
    return () => calls.unsubscribed.push(name);
  };
  const { GameSourceAlertsRunner } = load(
    "src/lib/games/source-alerts-runner.tsx",
    {
      "./source-matches": { matchingReleasesAsync: async () => [] },
      react: react.module,
      "@tauri-apps/api/core": { isTauri: () => true },
      "@tauri-apps/api/window": mainWindow,
      "@/lib/features/install": { useInstallFeatures: () => installed.current },
      "@/lib/profiles": profiles,
      "@/lib/i18n": translate,
      "@/components/lists/list-toast": { emitListToast: () => {} },
      "./source-alerts": {
        claimSourceAlert: () => null,
        readSourceAlerts: () => ({ watches: [] }),
        recordSourceAlertCheck: () => {},
        SOURCE_ALERT_PREFIX: "alerts.",
        subscribeSourceAlerts: subscribe("alerts"),
      },
      "./source-alert-check": { checkSourceAlerts: async () => ({}), SOURCE_ALERT_INTERVAL: 1 },
      "./source-fetch": { fetchGameSource: async () => null, fetchWebsiteSource: async () => null },
      "./source-store": {
        readSourceCatalogs: async () => [],
        readSourceSubscriptions: async () => [],
        subscribeSourceStore: subscribe("sources"),
      },
    },
    {
      window: {
        addEventListener: (name, handler) => calls.listeners.push([name, handler]),
        removeEventListener: (name, handler) => calls.removed.push([name, handler]),
      },
      // Timers are kept, not run: the test fires them itself to see whether the runner is stopped.
      setTimeout: (run) => calls.timers.push(run),
      clearTimeout: (id) => {
        if (id !== undefined) calls.cleared.push(id);
      },
    },
  );
  return { calls, render: () => react.render(GameSourceAlertsRunner) };
}

function mangaTracking(installed) {
  const react = hooks();
  const calls = { subscribed: [], unsubscribed: [], authChecks: 0 };
  const subscribe = (name) => () => {
    calls.subscribed.push(name);
    return () => calls.unsubscribed.push(name);
  };
  const { MangaTrackingRunner } = load("src/lib/manga-tracking.tsx", {
    react: react.module,
    "@/lib/features/install": { useInstallFeatures: () => installed.current },
    "@/lib/manga-progress": {
      listMangaProgress: () => [],
      subscribeMangaProgress: subscribe("progress"),
    },
    "@/lib/manga/tracking-anilist": {
      anilistMangaAuthed: () => {
        calls.authChecks++;
        return false;
      },
      pushAnilistManga: async () => ({ result: "noop", id: null }),
    },
    "@/lib/manga/tracking-mal": {
      malMangaAuthed: () => false,
      pushMalManga: async () => ({ result: "noop", id: null }),
    },
    "@/lib/manga/sync": { emitMangaSync: () => {} },
    "@/lib/manga-match": {
      getMangaMatchEntry: () => null,
      getMangaMatchTitle: () => null,
      normalizeTitle: (title) => title,
    },
    "@/lib/manga-reading-state": {
      getMangaReading: () => null,
      subscribeMangaReading: subscribe("reading"),
    },
    "@/lib/profiles": profiles,
  });
  return { calls, render: () => react.render(MangaTrackingRunner) };
}

const byName = (pairs) => [...pairs].sort((a, b) => a[0].localeCompare(b[0]));

test("game download notifications stay idle when Games is not installed", () => {
  const off = downloadNotifications(installation({ games: false }));
  assert.equal(off.render(), null);
  assert.deepEqual(off.calls, { watched: [], stopped: 0, listed: [], stillCurrent: null });

  // The installation can become known after the first render (the boot watchdog lets the
  // app start with every component assumed present). The runner has to follow the change.
  const installed = installation({ games: true });
  const late = downloadNotifications(installed);
  late.render();
  assert.deepEqual(late.calls.watched, ["profile"]);
  assert.deepEqual(late.calls.listed, ["games_list_transfers"]);
  assert.equal(late.calls.stillCurrent(), true);
  installed.current = { games: false };
  late.render();
  assert.equal(late.calls.stopped, 1);
  assert.equal(late.calls.stillCurrent(), false);
  assert.deepEqual(late.calls.watched, ["profile"]);
});

test("game source alerts keep no timer or listener when Games is not installed", async () => {
  const off = sourceAlerts(installation({ games: false }));
  assert.equal(off.render(), null);
  assert.deepEqual(off.calls, {
    subscribed: [],
    unsubscribed: [],
    listeners: [],
    removed: [],
    timers: [],
    cleared: [],
  });

  const installed = installation({ games: true });
  const late = sourceAlerts(installed);
  late.render();
  assert.deepEqual([...late.calls.subscribed].sort(), ["alerts", "sources"]);
  assert.deepEqual(late.calls.listeners.map(([name]) => name).sort(), ["online", "storage"]);
  assert.equal(late.calls.timers.length, 1);
  installed.current = { games: false };
  late.render();
  assert.deepEqual([...late.calls.unsubscribed].sort(), ["alerts", "sources"]);
  // The very handlers that were added are the ones taken off again.
  assert.deepEqual(byName(late.calls.removed), byName(late.calls.listeners));
  assert.equal(late.calls.cleared.length, 1);
  // A timer that fires after the teardown must find the runner stopped and schedule nothing.
  // A copy of the list: a runner that was not stopped would add to it while it is walked.
  for (const fire of late.calls.timers.slice()) await fire();
  assert.equal(late.calls.timers.length, 1);
  assert.equal(late.calls.subscribed.length, 2);
});

test("manga tracking does not subscribe when Manga is not installed", () => {
  const off = mangaTracking(installation({ manga: false }));
  assert.equal(off.render(), null);
  assert.deepEqual(off.calls, { subscribed: [], unsubscribed: [], authChecks: 0 });

  const installed = installation({ manga: true });
  const late = mangaTracking(installed);
  late.render();
  assert.deepEqual([...late.calls.subscribed].sort(), ["progress", "reading"]);
  assert.ok(late.calls.authChecks > 0);
  installed.current = { manga: false };
  late.render();
  assert.deepEqual([...late.calls.unsubscribed].sort(), ["progress", "reading"]);
  assert.equal(late.calls.subscribed.length, 2);
});

test("global search queries only the components this installation has", () => {
  const search = read("src/lib/search-context.tsx");
  assert.match(search, /const installFeatures = useInstallFeatures\(\);/);
  assert.match(search, /const mangaAllowed = settings\.mangaEnabled && installFeatures\.manga;/);
  assert.match(search, /const musicAllowed = installFeatures\.music;/);
  assert.match(search, /const ebookAllowed = installFeatures\.ebook;/);
  // Each lookup sits behind its gate, and the provider calls it nowhere else.
  assert.match(search, /mangaAllowed\s*\?\s*guard\(\s*searchManga\(/);
  assert.match(search, /musicAllowed\s*\?\s*guard\(\s*searchTyped\(/);
  assert.match(search, /ebookAllowed\s*\?\s*guard\(\s*searchEBooks\(/);
  const code = search.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const lookup of ["searchManga", "searchTyped", "searchEBooks"])
    assert.equal(code.match(new RegExp(`\\b${lookup}\\(`, "g"))?.length, 1, lookup);
  // A component that becomes known after the first render must restart the search effect.
  for (const key of ["manga", "music", "ebook"])
    assert.match(search, new RegExp(`\\binstallFeatures\\.${key},`));

  // The person page inside search runs its own music lookup. The overlay hands it the music
  // link only when Music is installed, and the page looks nothing up without that link.
  const overlay = read("src/components/search/search-overlay.tsx");
  assert.match(overlay, /onOpenMusic=\{\s*installFeatures\.music\s*\?\s*\(/);
  assert.match(read("src/components/search/explore-pane.tsx"), /onOpenMusic=\{onOpenMusic\}/);
  const person = read("src/components/player/cast-modal/person-panel.tsx");
  assert.match(person, /const wantsMusic = !!onOpenMusic;/);
  assert.match(person, /if \(!wantsMusic \|\|/);

  // Big Picture pulses a slot only for a source that was queried, so its gate must match,
  // and what the gate is computed from must include the installation.
  const bigPicture = read("src/views/big-picture/use-bp-search.ts");
  assert.match(bigPicture, /const mangaInstalled = useInstallFeatures\(\)\.manga;/);
  assert.match(bigPicture, /manga: settings\.mangaEnabled && mangaInstalled,/);
  const gateDependencies = bigPicture.match(/useMemo<BpSourceGates>\([^[]*\[([^\]]*)\]/)?.[1];
  assert.match(gateDependencies ?? "", /\bmangaInstalled\b/);
});
