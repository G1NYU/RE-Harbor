import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { retryGit } from "../tools/pokemon-engine/retry-git.mjs";

test("source fetch returns immediately when Git succeeds", async () => {
  let calls = 0;
  const result = await retryGit(
    "source fetch",
    async () => {
      calls++;
      return "pinned commit";
    },
    {
      wait: () => {
        throw Error("unexpected retry");
      },
    },
  );
  assert.equal(result, "pinned commit");
  assert.equal(calls, 1);
});

test("transient Git failures retry without changing the pinned command", async () => {
  let calls = 0;
  const delays = [];
  const warnings = [];
  const result = await retryGit(
    "pinned source fetch",
    async () => {
      calls++;
      if (calls < 3) throw Error("temporary GitHub HTTP error");
      return "verified revision";
    },
    {
      wait: async (ms) => delays.push(ms),
      warn: (line) => warnings.push(line),
    },
  );
  assert.equal(result, "verified revision");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5_000, 10_000]);
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every((line) => !line.includes("HTTP error")));
});

test("the corresponding-source bundle includes the Git retry helper", async () => {
  const script = await readFile(
    new URL("../tools/pokemon-engine/build.mjs", import.meta.url),
    "utf8",
  );
  assert.match(script, /"retry-git\.mjs"/);
  assert.match(script, /actual !== lock\[key\]\.commit/);
  assert.match(script, /if \(dirty\) throw Error/);
});

test("persistent Git failures still fail after bounded attempts", async () => {
  let calls = 0;
  const reason = Error("git exited 128");
  const delays = [];
  await assert.rejects(
    retryGit(
      "submodule fetch",
      async () => {
        calls++;
        throw reason;
      },
      { wait: async (ms) => delays.push(ms), warn: () => {} },
    ),
    (error) => error === reason,
  );
  assert.equal(calls, 4);
  assert.deepEqual(delays, [5_000, 10_000, 15_000]);
});
