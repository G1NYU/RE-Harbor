import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixtureAdapter } from '../tools/8spine-fixture-contract.mjs';

function fixture() {
  const calls = [];
  return {
    calls,
    module: {
      id: 'harbor-fixture',
      async searchTracks(query, limit) {
        calls.push(['search', query, limit]);
        return { tracks: [
          { id: 42, title: 'Original test tone', artist: 'Fixture', album: 'Audio tests', duration: 5 },
          { id: null, artist: 'Malformed' },
        ], total: 2 };
      },
      async getTrackStreamUrl(id, quality) {
        calls.push(['resolve', id, quality]);
        return { streamUrl: 'https://example.invalid/fixture.wav', track: { id, audioQuality: quality } };
      },
    },
  };
}

test('documented search and resolution contract preserves module identity and numeric IDs', async () => {
  const f = fixture();
  const adapter = makeFixtureAdapter(f.module);
  const tracks = await adapter.search('test tone', 10);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].moduleId, 'harbor-fixture');
  assert.equal(tracks[0].trackId, 42);
  assert.equal(tracks[0].durationSeconds, 5);
  assert.deepEqual(await adapter.resolve(tracks[0], 'LOSSLESS'), {
    streamUrl: 'https://example.invalid/fixture.wav', quality: 'LOSSLESS',
  });
  assert.deepEqual(f.calls, [['search', 'test tone', 10], ['resolve', 42, 'LOSSLESS']]);
});

test('unrecognized module IDs and invalid queries are rejected before calling the fixture', async () => {
  const f = fixture();
  const adapter = makeFixtureAdapter(f.module);
  await assert.rejects(adapter.search(' ', 10), /Invalid search/);
  await assert.rejects(adapter.resolve({moduleId: 'other', trackId: 42}), /Wrong module/);
  assert.equal(f.calls.length, 0);
});

test('unexpected stream destination fails validation', async () => {
  const f = fixture();
  f.module.getTrackStreamUrl = async () => ({ streamUrl: 'https://other.test/track.wav' });
  const adapter = makeFixtureAdapter(f.module);
  await assert.rejects(adapter.resolve({moduleId: 'harbor-fixture', trackId: 42}), /Fixture stream/);
});

test('missing methods and malformed search responses fail closed', async () => {
  assert.throws(() => makeFixtureAdapter({ id: 'broken' }), /Invalid module contract/);
  const f = fixture();
  f.module.searchTracks = async () => ({ invalid: [] });
  await assert.rejects(makeFixtureAdapter(f.module).search('tone'), /Invalid search response/);
});
