import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogCoverArt } from "../src/lib/music/cover-art-url";

const id = "cd21d4e9-af51-4e7c-bd9f-a5f31d5cfe1a";
const archive = `https://archive.org/download/mbid-${id}/mbid-${id}-34059386237_thumb500.jpg`;

test("legacy ListenBrainz covers are upgraded to supported CAA thumbnail and front fallback", () => {
  const image = catalogCoverArt(`musicbrainz:release:${id}`, archive);
  assert.equal(image.src, `https://coverartarchive.org/release/${id}/34059386237-500`);
  assert.deepEqual(image.fallbacks, [`https://coverartarchive.org/release/${id}/front-500`]);
  assert.equal(image.stableMissing, true);
});

test("catalog provides supported release-group fallbacks, leaving unrelated providers untouched", () => {
  const empty = catalogCoverArt(`musicbrainz:release-group:${id}`, "");
  assert.equal(empty.src, `https://coverartarchive.org/release-group/${id}/front-500`);
  assert.deepEqual(empty.fallbacks, []);
  assert.deepEqual(catalogCoverArt("deezer:album:10", "https://example.org/album.jpg"), {
    src: "https://example.org/album.jpg",
    fallbacks: [],
    stableMissing: false,
  });
});

test("only permanent catalog artwork failures suppress retry and use neutral placeholders", () => {
  const cards = readFileSync("src/components/music/music-cover-card.tsx", "utf8");
  const poster = readFileSync("src/components/poster.tsx", "utf8");
  assert.match(cards, /retryOnError=\{!artwork\.stableMissing\}/);
  assert.match(cards, /fallbackColor=\{artwork\.stableMissing/);
  assert.match(poster, /if \(!exhausted \|\| !retryOnError\) return/);
});

test("Music hero is a native dynamic image, without expensive background filters", () => {
  const jsx = readFileSync("src/views/music/music-listening-home.tsx", "utf8");
  const css = readFileSync("src/views/music/music-listening-home.css", "utf8");
  assert.match(jsx, /className="music-room-backdrop"/);
  assert.match(jsx, /src=\{subject\.artwork\}/);
  assert.match(css, /\.music-room-feature \{/);
  assert.match(css, /border-radius: 0/);
  assert.doesNotMatch(css, /filter:\s*blur\(/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur\(/);
});
