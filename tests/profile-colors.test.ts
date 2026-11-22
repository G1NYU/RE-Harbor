import assert from "node:assert/strict";
import test from "node:test";
import { profileThemeScope } from "@/lib/profile-theme";
import { profileCardStyle } from "@/lib/social/profile-card-appearance";

test("card and profile themes use chosen colors without automatic contrast correction", () => {
  const style = profileCardStyle({
    theme: "custom",
    from: "#ffffff",
    to: "#ffffff",
    gradient: "",
    accent: null,
    nameColor: "#ffffff",
    handleColor: "#ffffff",
    textColor: "#ffffff",
    bioColor: "#ffffff",
    bgUrl: null,
    bgKind: null,
    customised: true,
  }) as Record<string, string>;
  assert.equal(style["--profile-card-name"], "#ffffff");
  assert.equal(style["--profile-card-handle"], "#ffffff");
  assert.equal(style["--color-ink"], "#ffffff");
  assert.equal(style.backgroundImage, "linear-gradient(135deg, #ffffff, #ffffff)");
  const scope = profileThemeScope({
    palette: "custom",
    glass: false,
    gradient: false,
    colors: { canvas: "#ffffff", surface: "#ffffff", ink: "#ffffff", accent: "#ffffff" },
  });
  assert.equal(scope.vars["--color-ink"], "#ffffff");
  assert.equal(scope.vars["--color-canvas"], "#ffffff");
  assert.equal(scope.vars["--color-accent"], "#ffffff");
});
