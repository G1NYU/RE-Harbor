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
  const h = harness(() =>
    new Response(JSON.stringify({ username: "tester" }), { status: 200 }),
  );
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
  const h = harness(() =>
    new Response(JSON.stringify({ data: [{ episode: { season: 2, number: 6 } }] }), {
      status: 200,
    }),
  );
  const result = await h.client.lookupRefract(
    "rfk_private",
    "tvdb",
    "371980",
    "episode",
    1,
    6,
  );
  assert.equal(result.length, 1);
  const url = new URL(h.calls[0].url);
  assert.equal(url.pathname, "/v1/search/tvdb/371980");
  assert.equal(url.searchParams.get("type"), "episode");
  assert.equal(url.searchParams.get("numbering"), "tvdb");
  assert.equal(url.searchParams.get("season"), "1");
  assert.equal(url.searchParams.get("number"), "6");
});

test("Refract 429 uses server-supplied Retry-After delay", async () => {
  const h = harness(() =>
    new Response("{}", { status: 429, headers: { "Retry-After": "13" } }),
  );
  await assert.rejects(
    () => h.client.verifyRefractKey("rfk_private"),
    (error) => error instanceof h.client.RefractApiError &&
      error.status === 429 && error.retryAfterMs === 13000,
  );
});
