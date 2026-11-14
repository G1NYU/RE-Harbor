#!/usr/bin/env node
/**
 * 8SPINE repository compatibility probe for Harbor.
 * Intentionally never executes downloaded module code.
 * Usage: node tools/8spine-probe.mjs [--json] [--index=https://.../index.json] [--inspect-packages]
 */
import { pathToFileURL } from 'node:url';

export const DEFAULT_INDEXES = [
  'https://8spine-modules.pages.dev/index.json',
];

const MAX_INDEX_BYTES = 256 * 1024;
const MAX_MODULE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 12_000;

export function checkedUrl(value, base) {
  let url;
  try { url = new URL(value, base); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:') throw new Error('Only HTTPS module URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are disallowed');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|::1$)/.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error('Private and loopback addresses are disallowed');
  }
  url.hash = '';
  return url.href;
}

/** Flatten published music module categories. Never follow external indexes automatically. */
export function parseIndex(data, indexUrl) {
  const root = typeof data === 'string' ? JSON.parse(data) : data;
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('Invalid repository index');
  }
  const categories = Object.entries(root).filter(([key, value]) =>
    key.startsWith('category:') && Array.isArray(value));
  if (!categories.length) throw new Error('No category:modules or other category arrays in repository index');
  const seen = new Set();
  const rows = [];
  for (const [category, entries] of categories) {
    if (category === 'category:artworks' || category === 'category:testing') continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || entry.type !== 'MODULE' ||
          typeof entry.id !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(entry.id) ||
          typeof entry.name !== 'string' || !entry.name.trim()) continue;
      const target = typeof entry.download === 'string' ? entry.download : entry.file;
      if (typeof target !== 'string' || !target.trim()) continue;
      let download;
      try { download = checkedUrl(target, indexUrl); } catch { continue; }
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      rows.push({
        id: entry.id,
        name: entry.name,
        version: typeof entry.version === 'string' ? entry.version : 'unknown',
        download,
        category: category.slice('category:'.length),
        author: typeof entry.author === 'string' ? entry.author : null,
        tags: Array.isArray(entry.tags) ? entry.tags.filter(t => typeof t === 'string').slice(0, 20) : [],
      });
      if (rows.length >= 1000) return rows;
    }
  }
  return rows;
}

export function classifyModule(buffer) {
  const head = Buffer.from(buffer).subarray(0, 512).toString('utf8');
  if (head.startsWith('8SM1.')) return 'packed-8sm1';
  if (/\b(?:const|var|let|function|return|export|async)\b/.test(head) ||
      head.startsWith('//') || head.startsWith('/*')) return 'javascript-candidate';
  return 'unknown-format';
}

async function fetchLimited(input, maxBytes) {
  let current = checkedUrl(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json, text/plain, */*' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect missing Location header');
      current = checkedUrl(location, current);
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
    const indicatedLength = Number(response.headers.get('content-length'));
    if (indicatedLength > maxBytes) {
      await response.body?.cancel();
      throw new Error(`Response exceeds ${maxBytes} bytes`);
    }
    if (!response.body) throw new Error('No response body');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return { bytes: Buffer.concat(chunks), url: current };
  }
  throw new Error('Too many redirects');
}

export async function probeIndex(indexUrl, { inspectPackages = false } = {}) {
  const record = { indexUrl, status: 'error', modules: [] };
  try {
    const { bytes, url } = await fetchLimited(indexUrl, MAX_INDEX_BYTES);
    const modules = parseIndex(bytes.toString('utf8'), url);
    record.status = 'ok';
    if (!inspectPackages) {
      record.modules = modules.map(module => ({ ...module, status: 'catalogued-not-inspected' }));
      return record;
    }
    record.modules = await Promise.all(modules.map(async module => {
      try {
        const { bytes: payload } = await fetchLimited(module.download, MAX_MODULE_BYTES);
        return { ...module, status: classifyModule(payload), bytes: payload.length };
      } catch (error) {
        return { ...module, status: 'download-error', error: String(error.message ?? error) };
      }
    }));
  } catch (error) {
    record.error = String(error.message ?? error);
  }
  return record;
}

function printHuman(results) {
  for (const result of results) {
    console.log(`\n${result.indexUrl}`);
    console.log(result.status === 'ok' ? `  Index OK; ${result.modules.length} modules` : `  Index error: ${result.error}`);
    for (const module of result.modules) {
      console.log(`  - ${module.name} (${module.id}, ${module.version}): ${module.status}${module.bytes ? ` [${module.bytes} bytes]` : ''}`);
      if (module.error) console.log(`    ${module.error}`);
    }
  }
  console.log('\nNo module code was executed. "javascript-candidate" does not imply Harbor playback compatibility.');
}

export async function main(args = process.argv.slice(2)) {
  const json = args.includes('--json');
  const indexes = args.filter(arg => arg.startsWith('--index=')).map(arg => arg.slice('--index='.length));
  const targets = indexes.length ? indexes : DEFAULT_INDEXES;
  const inspectPackages = args.includes('--inspect-packages');
  const results = await Promise.all(targets.map(index => probeIndex(index, { inspectPackages })));
  if (json) console.log(JSON.stringify(results, null, 2));
  else printHuman(results);
  return results.some(result => result.status !== 'ok') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(String(error.message ?? error));
    process.exitCode = 1;
  });
}
