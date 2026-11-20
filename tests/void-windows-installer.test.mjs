import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, root), "utf8"));

test("VOID installer is a regular, independent per-user Windows setup", () => {
  const base = readJson("src-tauri/tauri.conf.json");
  const portable = readJson("src-tauri/tauri.music-preview.conf.json");
  const installer = readJson("src-tauri/tauri.void-installer.conf.json");
  assert.equal(base.identifier, "app.harbor");
  assert.equal(portable.identifier, "app.harbor.voidnativepreview");
  assert.equal(installer.identifier, portable.identifier);
  assert.notEqual(installer.identifier, base.identifier);
  assert.equal(installer.productName, "Harbor VOID");
  assert.deepEqual(installer.bundle.targets, ["nsis"]);
  assert.deepEqual(installer.bundle.fileAssociations, []);
  assert.equal(installer.bundle.createUpdaterArtifacts, false);
  assert.equal(installer.bundle.windows.nsis.installMode, "currentUser");
  assert.deepEqual(installer.plugins.updater.endpoints, []);
  assert.deepEqual(installer.plugins["deep-link"].desktop.schemes, [
    "harbor-void-native-preview",
  ]);
  assert.notDeepEqual(
    installer.plugins["deep-link"].desktop.schemes,
    base.plugins["deep-link"].desktop.schemes,
  );
});

test("Windows installer packaging keeps native playback dependencies", () => {
  const workflow = readFileSync(
    new URL(".github/workflows/void-windows-installer.yml", root),
    "utf8",
  );
  assert.ok(workflow.includes("pnpm run setup"));
  assert.ok(workflow.includes("tauri.void-installer.conf.json"));
  assert.ok(workflow.includes("tauri.windows.conf.json"));
  assert.ok(workflow.includes("tauri.music-preview.conf.json"));
  assert.ok(workflow.includes("pnpm tauri build --bundles nsis"));
  assert.ok(workflow.includes("InstallLocation"));
  assert.ok(workflow.includes("uninstall.exe"));
  assert.ok(workflow.includes("Start menu shortcut"));
  assert.ok(workflow.includes("actions/upload-artifact@v4"));
  assert.ok(!workflow.includes("gh release"));
});
