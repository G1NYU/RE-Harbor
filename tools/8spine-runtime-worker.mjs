// Development-only worker. Never accepts downloaded or caller-supplied source.
import vm from 'node:vm';

const FIXTURES = Object.freeze({
  catalog: `return {
    id: 'harbor-fixture',
    async searchTracks(query, limit) {
      const tracks = [{ id: 42, title: 'Original test tone', artist: 'Fixture', duration: 5 }]
        .filter(t => (t.title + ' ' + t.artist).toLowerCase().includes(query.toLowerCase())).slice(0, limit);
      return { tracks, total: tracks.length };
    },
    async getTrackStreamUrl(id, quality) {
      if (id !== 42) throw new Error('Unknown track');
      return { streamUrl: 'https://example.invalid/fixture.wav', track: { id, audioQuality: quality } };
    }
  };`,
  capabilities: `return { searchTracks() { return {
    process: typeof process, require: typeof require, fetch: typeof fetch,
    consoleBridge: typeof console, timers: typeof setTimeout,
    evalBlocked: (() => { try { eval('1'); return false; } catch { return true; } })(),
    functionBlocked: (() => { try { Function('return 1')(); return false; } catch { return true; } })()
  }; } };`,
  loop: `return { searchTracks() { while (true) {} } };`,
  pending: `return { searchTracks() { return new Promise(() => {}); } };`,
  oversized: `return { searchTracks() { return 'x'.repeat(300000); } };`,
  failure: `return { searchTracks() { throw new Error('internal fixture detail'); } };`,
});

const MAX_INPUT = 8192;
const MAX_OUTPUT = 262144;
async function run() {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) throw new Error('input-limit');
    chunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Object.hasOwn(FIXTURES, request.fixture) || !['search', 'resolve'].includes(request.operation))
    throw new Error('invalid-request');
  const ctx = vm.createContext(Object.assign(Object.create(null), { console: undefined }), {
    codeGeneration: { strings: false, wasm: false }, microtaskMode: 'afterEvaluate',
  });
  // Only a fixed local fixture is interpolated as code. Request data is JSON, never code.
  const payload = JSON.stringify(JSON.stringify(request));
  const source = `"use strict";
    const input = JSON.parse(${payload});
    const moduleInstance = (function () { ${FIXTURES[request.fixture]} })();
    Promise.resolve().then(() => input.operation === 'search'
      ? moduleInstance.searchTracks(input.query, input.limit)
      : moduleInstance.getTrackStreamUrl(input.trackId, input.quality))
      .then(value => { globalThis.__result = JSON.stringify(value); }, () => { globalThis.__failed = true; });`;
  vm.runInContext(source, ctx, { timeout: 200 });
  if (ctx.__failed) throw new Error('fixture-failed');
  if (typeof ctx.__result !== 'string') throw new Error('unsettled-result');
  if (Buffer.byteLength(ctx.__result) > MAX_OUTPUT) throw new Error('output-limit');
  return JSON.parse(ctx.__result);
}
try {
  const result = await run();
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (error) {
  const known = ['input-limit', 'output-limit', 'invalid-request', 'fixture-failed', 'unsettled-result'];
  const code = error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'execution-timeout'
    : known.includes(error?.message) ? error.message : 'worker-failed';
  process.stdout.write(JSON.stringify({ ok: false, error: code }));
}
