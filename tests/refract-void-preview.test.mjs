import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("VOID uses the real Refract 512px transparent press-kit icon everywhere", () => {
  const logo = readFileSync(new URL("../src/assets/refract.png", import.meta.url));
  assert.equal(logo.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(logo.readUInt32BE(16), 512);
  assert.equal(logo.readUInt32BE(20), 512);
  assert.equal(logo[25], 6);
  for (const path of [
    "../src/views/settings/tab-registry.ts",
    "../src/views/settings/trackers-panel.tsx",
    "../src/views/settings/licenses-panel.tsx",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes('import refractLogo from "@/assets/refract.png";'), path);
    assert.ok(!source.includes('refract.svg'), path);
  }
  const licenses = readFileSync(
    new URL("../src/views/settings/licenses-panel.tsx", import.meta.url),
    "utf8",
  );
  const trackers = licenses.slice(
    licenses.indexOf("const TRACKERS: Credit[] = ["),
    licenses.indexOf("const SUBTITLES: Credit[] = ["),
  );
  assert.ok(trackers.includes('name: "Refract"'));
  assert.ok(trackers.includes("https://getrefract.app"));
  assert.ok(trackers.includes("logo: refractLogo"));
});
