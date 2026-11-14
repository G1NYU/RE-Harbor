import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedUrl, parseIndex, classifyModule } from '../tools/8spine-probe.mjs';

const index = 'https://raw.githubusercontent.com/example/spine/refs/heads/main/index.json';

test('parses and resolves a relative 8SPINE module download', () => {
  const rows = parseIndex({ 'category:modules': [
    { id: 'reverb', name: 'Reverb', type: 'MODULE', download: 'reverb.8spine', version: '1.0' },
  ] }, index);
  assert.deepEqual(rows, [{
    id: 'reverb', name: 'Reverb', version: '1.0',
    download: 'https://raw.githubusercontent.com/example/spine/refs/heads/main/reverb.8spine',
    category: 'modules', author: null, tags: [],
  }]);
});

test('skips non-source artwork, duplicate and unsafe module records', () => {
  const rows = parseIndex({ 'category:modules': [
    { id: 'jimmy', name: 'Jimmy', type: 'MODULE', download: 'https://jimmy-iota.vercel.app/jimmy.js' },
    { id: 'art', name: 'Art', type: 'ARTWORK', download: 'art.js' },
    { id: 'jimmy', name: 'Duplicate', type: 'MODULE', download: 'other.js' },
    { id: 'secret', name: 'Unsafe', type: 'MODULE', download: 'file:///etc/passwd' },
  ] }, index);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'jimmy');
});

test('requires the documented module array', () => {
  assert.throws(() => parseIndex({ modules: [] }, index), /category:modules/);
});

test('rejects unsafe or local module URLs', () => {
  for (const url of ['http://example.com/thing', 'https://localhost/x',
    'https://127.0.0.1/x', 'https://192.168.1.1/x',
    'https://user:pass@example.com/index.json', 'javascript:alert(1)']) {
    assert.throws(() => checkedUrl(url));
  }
});

test('classifies opaque 8SM1 packages and JS without executing either', () => {
  assert.equal(classifyModule(Buffer.from('8SM1.abcdef')), 'packed-8sm1');
  assert.equal(classifyModule(Buffer.from('// source\nreturn { searchTracks() {} };')), 'javascript-candidate');
  assert.equal(classifyModule(Buffer.from([0x01, 0x02, 0x03])), 'unknown-format');
});

test('flattens multiple categories and ignores access-only, artwork and loaderless duplicates', () => {
  const repo = 'https://example.test/index.json';
  const rows = parseIndex({
    external_sources: [{ url: 'https://elsewhere.test/index.json' }],
    'category:modules': [
      { id: 'first', name: 'First', type: 'MODULE', download: 'modules/first.js', author: 'fixture', tags: ['LOSSLESS'] },
      { id: 'second', name: 'Bad', type: 'MODULE', download: 'file:///tmp/no' },
    ],
    'category:alex_modules': [
      { id: 'second', name: 'Second', type: 'MODULE', download: '/alex/second.8spine' },
      { id: 'first', name: 'Duplicate', type: 'MODULE', download: '/other.js' },
    ],
    'category:ricky_modules': [{ id: 'private', name: 'Private', accessUrl: 'https://example.test/invite' }],
    'category:artworks': [{ id: 'artwork', name: 'Artwork', type: 'ARTWORK', download: 'art.js' }],
  }, repo);
  assert.deepEqual(rows.map(x => x.id), ['first', 'second']);
  assert.equal(rows[0].author, 'fixture');
  assert.deepEqual(rows[0].tags, ['LOSSLESS']);
  assert.equal(rows[1].category, 'alex_modules');
  assert.equal(rows[1].download, 'https://example.test/alex/second.8spine');
});
