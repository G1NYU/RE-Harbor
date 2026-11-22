import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("the profile exposes Mutual Ratings through the Ratings view for eligible visitors", () => {
  const profile = source("../src/views/profile/profile.tsx");
  const ratings = source("../src/views/ratings/user-ratings.tsx");
  assert.doesNotMatch(profile, /<MutualRatings(?:Card)?\b/);
  assert.match(
    profile,
    /viewerSignedIn && !summary\.isOwner && !locked && summary\.friendStatus !== "blocked"/,
  );
  assert.match(profile, /<UserRatings\b[\s\S]*?mutualHandle=\{mutualHandle\}/);
  assert.match(ratings, /mutualVisible \? \(\s*<MutualRatings\b/);
});
