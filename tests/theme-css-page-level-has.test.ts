import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { RECIPES } from "../src/views/settings/theme-panel/theme-studio/cheat-sheet-recipes.ts";
import { pageLevelHasSelectors } from "./helpers/page-level-has.ts";

// The CSS of the built-in themes and of the Theme Studio chrome builder lives in TypeScript template
// strings, where a scan of the .css files does not see it.
const SOURCES = [
  "src/lib/theme.ts",
  "src/lib/theme-kawaii.ts",
  "src/views/settings/theme-panel/theme-studio/chrome-config.ts",
];

/** Every template string assigned to a variable whose name ends in "css", in any letter case. */
function cssTemplates(path: string): { name: string; css: string }[] {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const found: { name: string; css: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /css$/i.test(node.name.text) &&
      node.initializer &&
      ts.isNoSubstitutionTemplateLiteral(node.initializer)
    ) {
      found.push({ name: `${path} ${node.name.text}`, css: node.initializer.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("theme CSS kept in TypeScript asks no :has() question of the whole page", () => {
  const sheets = [
    ...SOURCES.flatMap(cssTemplates),
    ...RECIPES.filter((recipe) => recipe.lang === "css").map((recipe) => ({
      name: `recipe "${recipe.title}"`,
      css: recipe.code,
    })),
  ];
  const names = sheets.map((sheet) => sheet.name);
  for (const expected of [
    "elegantFinCss",
    "feishinCss",
    "kawaiiCss",
    "SIDEBAR_CSS",
    "TOPBAR_CSS",
  ]) {
    assert.ok(
      names.some((name) => name.endsWith(` ${expected}`)),
      `expected to scan ${expected}`,
    );
  }
  assert.ok(
    names.some((name) => name.startsWith("recipe ")),
    "expected to scan the CSS recipes",
  );

  const offenders = sheets.flatMap((sheet) =>
    pageLevelHasSelectors(sheet.css).map((selector) => `${sheet.name}: ${selector}`),
  );
  assert.deepEqual(offenders, []);
});
