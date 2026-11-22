import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { HarborMark } from "@/components/icons/harbor-mark";

let summary: unknown;
const dependencies: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@/lib/i18n": { useT: () => (value: string) => value },
  "@/lib/ratings/types": { inferRatingMediaType: () => "movie" },
  "@/lib/social/friend-review-index": {
    ensureMarksForTitle: () => {},
    useTitleHoverSummary: () => summary,
  },
  "@/components/icons/unrated-review-icon": {
    UnratedReviewIcon: () => React.createElement("span"),
  },
  "@/components/hover-tooltip": {
    HoverTooltip: ({ details, mark }: { details: React.ReactNode; mark: React.ReactNode }) =>
      React.createElement("div", null, mark, details),
  },
  "@/views/profile/profile-bits": { Avatar: () => React.createElement("span") },
  "@/components/icons/harbor-mark": { HarborMark },
};
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/components/ratings/friend-review-badges.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const exports: Record<string, React.ComponentType<{ metaId: string }>> = {};
new Function("require", "exports", source)((name: string) => {
  assert.ok(name in dependencies, name);
  return dependencies[name];
}, exports);

test("rated and unrated hover descriptions share a centered gold Harbor icon at the original 20px size", () => {
  for (const fixture of [
    { friends: [{ handle: "fixture", alias: "Fixture", score: 8 }], averageScore: 8 },
    { friends: [], community: [], averageScore: null },
  ]) {
    summary = fixture;
    const dom = new JSDOM(
      renderToStaticMarkup(React.createElement(exports.FriendReviewBadges, { metaId: "fixture" })),
    );
    try {
      const icon = dom.window.document.querySelector('svg[class*="eba018"]')!;
      assert.ok(icon, "Harbor mark remains gold");
      assert.match(icon.getAttribute("class")!, /mx-auto/);
      assert.match(icon.getAttribute("class")!, /h-5 w-5/);
      assert.equal(icon.parentElement?.className, "text-center");
    } finally {
      dom.window.close();
    }
  }
});
