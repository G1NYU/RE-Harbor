import assert from "node:assert/strict";
import test from "node:test";
import { friendBadgePlan } from "@/components/ratings/friend-review-badges";

/**
 * The poster row shows at most three avatars and summarises the rest as "+N". The count comes
 * from the backend, uncapped, while the avatar list is capped — so these assertions pin the
 * arithmetic that turns one into the other.
 */

function mark(handle: string, totalCount?: number) {
  return { handle, alias: handle, at: 0, totalCount };
}

test("a few friends are all shown, with no +N", () => {
  const plan = friendBadgePlan([mark("a"), mark("b")]);
  assert.equal(plan.shown.length, 2);
  assert.equal(plan.extra, 0);
  assert.equal(plan.total, 2);
});

test("more than three friends show three avatars and count the rest", () => {
  const plan = friendBadgePlan([mark("a", 8), mark("b", 8), mark("c", 8), mark("d", 8)]);
  assert.deepEqual(
    plan.shown.map((m) => m.handle),
    ["a", "b", "c"],
  );
  assert.equal(plan.extra, 5);
  assert.equal(plan.total, 8);
});

test("without a backend count the remainder comes from the marks themselves", () => {
  const plan = friendBadgePlan([mark("a"), mark("b"), mark("c"), mark("d"), mark("e")]);
  assert.equal(plan.shown.length, 3);
  assert.equal(plan.extra, 2);
});

test("a count smaller than the avatar list never produces a negative badge", () => {
  const plan = friendBadgePlan([mark("a", 1), mark("b", 1), mark("c", 1)]);
  assert.equal(plan.extra, 0);
  assert.equal(plan.total, 3);
});

test("no friends means nothing to draw", () => {
  const plan = friendBadgePlan([]);
  assert.deepEqual(plan.shown, []);
  assert.equal(plan.extra, 0);
});
