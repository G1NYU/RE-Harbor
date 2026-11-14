// Fixture-only runtime prototype. Node vm and permissions are not a production sandbox.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./8spine-runtime-worker.mjs', import.meta.url));
const FIXTURES = new Set(['catalog', 'capabilities', 'loop', 'pending', 'oversized', 'failure']);
const MAX_STDOUT = 270000;
const WALL_MS = 3000;

export async function runFixture({ fixture = 'catalog', operation = 'search', query = 'test tone',
  limit = 20, trackId = 42, quality = 'HIGH' } = {}) {
  if (!FIXTURES.has(fixture) || !['search', 'resolve'].includes(operation) ||
      typeof query !== 'string' || !query.trim() || query.length > 512 ||
      !Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !(typeof trackId === 'string' && trackId.length > 0 && trackId.length <= 512 || Number.isSafeInteger(trackId)) ||
      !['LOSSLESS', 'HIGH', 'LOW'].includes(quality)) throw new Error('invalid-request');
  const request = JSON.stringify({ fixture, operation, query, limit, trackId, quality });
  const env = process.platform === 'win32' && process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {};
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--permission', `--allow-fs-read=${WORKER}`,
      '--max-old-space-size=32', WORKER], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let total = 0;
    const chunks = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill(); reject(new Error(error)); } else resolve(value);
    };
    const timer = setTimeout(() => finish('worker-wall-timeout'), WALL_MS);
    child.on('error', () => finish('worker-start-failed'));
    child.stdin.on('error', () => finish('worker-input-failed'));
    child.stderr.resume();
    child.stdout.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_STDOUT) finish('worker-output-limit');
      else if (!settled) chunks.push(chunk);
    });
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return finish('worker-exit-failed');
      try {
        const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (envelope.ok !== true) return finish(typeof envelope.error === 'string' ? envelope.error : 'worker-failed');
        finish(null, envelope.result);
      } catch { finish('worker-invalid-output'); }
    });
    child.stdin.end(request);
  });
}
