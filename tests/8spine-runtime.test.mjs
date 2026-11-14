import test from 'node:test';
import assert from 'node:assert/strict';
import { runFixture } from '../tools/8spine-runtime.mjs';

test('executes documented async search and resolve methods in a separate process', async () => {
  const search = await runFixture({ query: 'test tone', limit: 1 });
  assert.equal(search.total, 1);
  assert.equal(search.tracks[0].id, 42);
  assert.deepEqual(await runFixture({ operation: 'resolve', trackId: 42, quality: 'LOSSLESS' }), {
    streamUrl: 'https://example.invalid/fixture.wav', track: { id: 42, audioQuality: 'LOSSLESS' },
  });
});

test('no host APIs or dynamic code generation are exposed to fixture context', async () => {
  assert.deepEqual(await runFixture({ fixture: 'capabilities' }), {
    process: 'undefined', require: 'undefined', fetch: 'undefined', consoleBridge: 'undefined',
    timers: 'undefined', evalBlocked: true, functionBlocked: true,
  });
});

test('infinite and unsettled execution fail without hanging the caller', async () => {
  await assert.rejects(runFixture({ fixture: 'loop' }), /execution-timeout/);
  await assert.rejects(runFixture({ fixture: 'pending' }), /unsettled-result/);
});

test('oversized data and fixture exceptions fail closed', async () => {
  await assert.rejects(runFixture({ fixture: 'oversized' }), /output-limit/);
  await assert.rejects(runFixture({ fixture: 'failure' }), /^Error: fixture-failed$/);
  await assert.rejects(runFixture({ operation: 'resolve', trackId: 'wrong' }), /fixture-failed/);
});

test('rejects arbitrary source and invalid request parameters; treats queries as data', async () => {
  await assert.rejects(runFixture({ fixture: 'return {}' }), /invalid-request/);
  await assert.rejects(runFixture({ limit: 100000 }), /invalid-request/);
  await assert.rejects(runFixture({ quality: 'unknown' }), /invalid-request/);
  assert.deepEqual(await runFixture({ query: '\"); throw new Error("injection"); //' }), { tracks: [], total: 0 });
});
