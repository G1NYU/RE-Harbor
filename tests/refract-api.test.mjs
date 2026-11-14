import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function harness(responder = () => new Response("{}", { status: 200 })) {
  const calls = [];
  const file = readFileSync(new URL("../src/lib/refract/client.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(file, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const imports = {
    "@/lib/safe-fetch": {
      safeFetch: (url, init) => {
        calls.push({ url, init });
        return responder(url, init);
      },
    },
    "@/lib/secret-store": {
      readSharedSecret: () => null,
      writeSharedSecret: () => {},
    },
  };
  new Function("require", "module", "exports", output)(
    (id) => {
      assert.ok(id in imports, `Unexpected import: ${id}`);
      return imports[id];
    },
    module,
    module.exports,
  );
  return { client: module.exports, calls };
}

test("Refract key verification uses the official API and bearer authentication", async () => {
  const h = harness(() => new Response(JSON.stringify({ username: "tester" }), { status: 200 }));
  assert.equal(await h.client.verifyRefractKey("rfk_private"), "tester");
  assert.equal(h.calls[0].url, "https://getrefract.app/v1/me");
  assert.equal(h.calls[0].init.headers.Authorization, "Bearer rfk_private");
  assert.equal(h.calls[0].init.redirect, "error");
});

test("movie history includes the original time and a quoted stable idempotency key", async () => {
  const h = harness();
  const timestamp = Date.parse("2026-11-11T20:23:00.000Z");
  await h.client.writeRefractMovie("rfk_private", "movie-ref", timestamp, "same-request-id");
  assert.equal(h.calls.length, 1);
  const call = h.calls[0];
  assert.equal(call.url, "https://getrefract.app/v1/history/movies");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["Idempotency-Key"], '"same-request-id"');
  assert.deepEqual(JSON.parse(call.init.body), {
    movie_id: "movie-ref",
    watched_at: "2026-11-11T20:23:00.000Z",
  });
});

test("episode watched PUT preserves the original time across offline retries", async () => {
  const h = harness();
  await h.client.writeRefractEpisode(
    "rfk_private",
    "show-ref",
    2,
    7,
    Date.parse("2026-10-31T12:00:00Z"),
  );
  const call = h.calls[0];
  assert.equal(call.init.method, "PUT");
  assert.equal(call.url, "https://getrefract.app/v1/history/episodes/show-ref/2/7");
  assert.deepEqual(JSON.parse(call.init.body), {
    watched_at: "2026-10-31T12:00:00.000Z",
  });
});

test("TheTVDB episode resolution requests explicit TheTVDB numbering", async () => {
  const h = harness(
    () =>
      new Response(JSON.stringify({ data: [{ episode: { season: 2, number: 6 } }] }), {
        status: 200,
      }),
  );
  const result = await h.client.lookupRefract("rfk_private", "tvdb", "371980", "episode", 1, 6);
  assert.equal(result.length, 1);
  const url = new URL(h.calls[0].url);
  assert.equal(url.pathname, "/v1/search/tvdb/371980");
  assert.equal(url.searchParams.get("type"), "episode");
  assert.equal(url.searchParams.get("numbering"), "tvdb");
  assert.equal(url.searchParams.get("season"), "1");
  assert.equal(url.searchParams.get("number"), "6");
});

test("Refract 429 uses server-supplied Retry-After delay", async () => {
  const h = harness(() => new Response("{}", { status: 429, headers: { "Retry-After": "13" } }));
  await assert.rejects(
    () => h.client.verifyRefractKey("rfk_private"),
    (error) =>
      error instanceof h.client.RefractApiError &&
      error.status === 429 &&
      error.retryAfterMs === 13000,
  );
});

test("Refract is registered in the visible settings sidebar and tracker panel", () => {
  const registry = readFileSync(new URL("../src/views/settings/tab-registry.ts", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/views/settings/trackers-panel.tsx", import.meta.url), "utf8");
  assert.match(registry, /trackers:\s*\[[\s\S]*?id: "refract"/);
  assert.match(panel, /active === "refract" && <RefractPanel/);
});

test("automatic Refract playback threshold defaults to 70 percent and is configurable", () => {
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const { client } = harness();
    assert.equal(client.getRefractAutoThreshold(), 70);
    assert.equal(client.refractPlaybackReached(699, 1000), false);
    assert.equal(client.refractPlaybackReached(700, 1000), true);
    assert.equal(client.refractPlaybackReached(700, 0), false);
    assert.equal(client.refractPlaybackReached(700, Infinity), false);
    client.setRefractAutoThreshold(50);
    assert.equal(client.getRefractAutoThreshold(), 50);
    assert.equal(client.refractPlaybackReached(500, 1000), true);
    client.setRefractAutoThreshold(0);
    assert.equal(client.getRefractAutoThreshold(), 50);
    client.setRefractAutoThreshold(85);
    assert.equal(client.refractPlaybackReached(849, 1000), false);
    assert.equal(client.refractPlaybackReached(850, 1000), true);
  } finally {
    globalThis.localStorage = original;
  }
});

test("time-based Refract logging supports 3, 5 and 10 minutes", () => {
  const original = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const { client } = harness();
    for (const [mode, seconds] of [["3m", 180], ["5m", 300], ["10m", 600]]) {
      client.setRefractAutoThreshold(mode);
      assert.equal(client.getRefractAutoThreshold(), mode);
      assert.equal(client.refractPlaybackReached(seconds - 1, 2700), false);
      assert.equal(client.refractPlaybackReached(seconds, 2700), true);
      assert.equal(client.refractPlaybackReached(seconds, 7200), true);
      assert.equal(client.refractPlaybackReached(seconds, 0), false);
    }
    client.setRefractAutoThreshold("invalid");
    assert.equal(client.getRefractAutoThreshold(), "10m");
    client.setRefractAutoThreshold(70);
    assert.equal(client.getRefractAutoThreshold(), 70);
  } finally {
    globalThis.localStorage = original;
  }
});
