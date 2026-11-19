import assert from "node:assert/strict";
import test from "node:test";
import { VOID_DEFAULT_NAV_ORDER, withVoidDefaultNavOrder } from "../src/chrome/void-sidebar-order";

test("VOID default follows original grouped navigation without duplicates", () => {
  const order = VOID_DEFAULT_NAV_ORDER;
  assert.equal(new Set(order).size, order.length);
  assert.deepEqual(order.slice(0, 3), ["home", "discover", "catalogs"]);
  for (const [first, last] of [
    ["movies", "vod"], ["manga", "ebook"], ["music", "games"],
    ["library", "collections"], ["addons", "settings"],
  ]) {
    assert.ok(order.indexOf(first as typeof order[number]) < order.indexOf(last as typeof order[number]));
  }
  const cfg = { order: [], hidden: ["sports"], renamed: {} };
  const initial = withVoidDefaultNavOrder(cfg);
  assert.deepEqual(initial.order, VOID_DEFAULT_NAV_ORDER);
  assert.deepEqual(initial.hidden, ["sports"]);
  assert.deepEqual(cfg.order, [], "initial layout must not silently overwrite saved settings");
});

test("VOID respects a user's arbitrary saved order", () => {
  const custom = { order: ["music", "home", "manga", "games"], hidden: [], renamed: {} };
  assert.equal(withVoidDefaultNavOrder(custom), custom);
});
