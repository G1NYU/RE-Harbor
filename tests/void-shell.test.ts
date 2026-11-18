import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

test("new VOID chrome uses existing navigation and parental policy", () => {
  const rail = read("src/chrome/void/void-rail.tsx");
  assert.match(rail, /useSidebarNavigation/);
  assert.match(rail, /useNavDrag/);
  assert.match(rail, /NavEditableItem/);
  assert.match(rail, /ParentalPinModal/);
  assert.match(rail, /data-harbor-nav=\{item\.view\}/);
  assert.match(rail, /<Icon size=\{24\}/);
  assert.doesNotMatch(rail, /<NavLottie/);
});

test("utility chrome moves profile, settings and search without losing route gating", () => {
  const toolbar = read("src/chrome/void/void-command-bar.tsx");
  assert.match(toolbar, /AccountMenu/);
  assert.match(toolbar, /showSettings/);
  assert.match(toolbar, /isSettingsGated/);
  assert.match(toolbar, /setOpen: openSearch/);
  assert.match(toolbar, /WindowControls|void-window-controls/);
  assert.match(toolbar, /NotificationCenter/);
  assert.match(toolbar, /DownloadsButton/);
});

test("VOID shell is compiled, continuous and avoids blur or animation loops", () => {
  const css = read("src/chrome/void/void-shell.css");
  assert.match(css, /--void-shell-bg: #11111b/);
  assert.match(css, /\.void-command-bar/);
  assert.match(css, /\.void-rail/);
  assert.doesNotMatch(css, /backdrop-filter|@keyframes|filter:\s*blur\(/);
  assert.doesNotMatch(css, /border-bottom:|border-top:/);
});

test("shell selection does not rewire media or tracker behavior", () => {
  const app = read("src/App.tsx");
  const main = read("src/main.tsx");
  assert.match(app, /const voidShell = !kid && !preview && !bigPicture/);
  assert.match(app, /<VoidRail/);
  assert.match(app, /<VoidCommandBar/);
  assert.match(app, /!voidShell &&[\s\S]+<Sidebar\s*\/>/);
  assert.match(app, /\bMusicDock\b/);
  assert.match(main, /import "@\/chrome\/void\/void-shell\.css"/);
});
