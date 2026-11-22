import assert from "node:assert/strict";
import test from "node:test";
import { mutualScoreTone } from "@/lib/social/mutual-score";

test("match score colors honor every requested threshold boundary", () => {
  const cases = [
    [0, "text-red-400"],
    [39, "text-red-400"],
    [40, "text-orange-400"],
    [59, "text-orange-400"],
    [60, "text-yellow-400"],
    [74, "text-yellow-400"],
    [75, "text-lime-400"],
    [89, "text-lime-400"],
    [90, "text-emerald-400"],
    [100, "text-emerald-400"],
  ] as const;

  for (const [score, color] of cases) {
    assert.equal(mutualScoreTone(score).text, color, `${score}% uses the expected range`);
  }
});
