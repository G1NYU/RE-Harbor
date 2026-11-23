import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// What the bundler acts on: comments and type-only imports are gone before it sees a module.
const code = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import\s+type\b[^;]*;/gm, "");

// Every source module that can end up in a bundle, as [path, code]. The locale tables are left
// out: they are large and import nothing.
function sources() {
  return readdirSync(new URL("../src/", import.meta.url), { recursive: true })
    .map((entry) => `src/${String(entry).replaceAll("\\", "/")}`)
    .filter((path) => /\.[jt]sx?$/.test(path) && !path.startsWith("src/lib/i18n/locales/"))
    .map((path) => [path, code(read(path))]);
}

function loadEager(table) {
  const { outputText } = ts.transpileModule(read("src/lib/awards-history-eager.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const calls = [];
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => {
      if (name === "./awards-history") return { setBundledAwards: (...args) => calls.push(args) };
      if (name === "@/data/awards.json") return table();
      throw new Error(`Unexpected dependency: ${name}`);
    },
    module,
    module.exports,
  );
  return { ready: module.exports.bundledAwardsReady, calls };
}

test("desktop sets the award table when its chunk arrives", async () => {
  const table = { oscar: {} };
  const { ready, calls } = loadEager(() => ({ __esModule: true, default: table }));
  assert.deepEqual(calls, []);
  await ready;
  // One argument: desktop keeps building the title index lazily, on first use.
  assert.deepEqual(calls, [[table]]);
});

test("a failed award chunk reaches the boot watchdog as a rejection", async () => {
  const { ready, calls } = loadEager(() => {
    throw new Error("chunk failed to load");
  });
  await assert.rejects(ready, /chunk failed to load/);
  assert.deepEqual(calls, []);
});

test("the award table is a chunk of its own, awaited within a bound before the first render", () => {
  const all = sources();
  // One static import anywhere, under any spelling of the path, would pull the table back into
  // an entry chunk. The two dynamic imports are "import(", which this does not match.
  const importsTable = /\b(?:from|import)\s+["'][^"']*\/data\/awards\.json["']/;
  assert.deepEqual(
    all.filter(([, text]) => importsTable.test(text)).map(([path]) => path),
    [],
  );
  // Only the desktop entry may load the module that requests the table at boot, in any form of
  // import. Television fetches the table after its first paint instead.
  const importsEager = /\b(?:from|import)\s*\(?\s*["'][^"']*awards-history-eager["']/;
  assert.deepEqual(
    all.filter(([, text]) => importsEager.test(text)).map(([path]) => path),
    ["src/main.tsx"],
  );

  const main = code(read("src/main.tsx"));
  // The wait is bounded like the other boot reads, and the watchdog exists before mount() first
  // yields, so a chunk that fails early is never an unhandled rejection.
  const watched = main.search(/withBootWatchdog\(\s*"awards",\s*bundledAwardsReady\b/);
  assert.ok(watched > 0, "the award table is awaited through the boot watchdog");
  assert.ok(watched < main.indexOf("await featuresPromise"), "created before the first await");
  assert.match(main, /markBootFallback\("awards"\)/);
  // The root renders only after that wait.
  const awaited = main.search(/await Promise\.all\(\[[^\]]*\bawardsPromise\b[^\]]*\]\)/);
  assert.ok(awaited > 0, "mount() awaits the award table");
  assert.ok(awaited < main.indexOf("createRoot("), "before the root renders");
});
