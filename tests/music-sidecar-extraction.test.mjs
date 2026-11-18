import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Windows sidecar ZIP extraction uses built-in tar, not PowerShell Expand-Archive", () => {
  const setup = readFileSync("scripts/fetch-binaries.mjs", "utf8");
  assert.match(setup, /process\.platform === "win32"[\s\S]*?execFileSync\("tar", \["-xf", archive, "-C", outDir\]/);
  assert.doesNotMatch(setup, /execFileSync\(\s*"powershell"/);
  assert.match(setup, /const found = findMember\(outDir, member\)/);
});
