import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseStoredSettings } from "@/lib/settings/load";

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

test("friend avatars are confined to the hover preview or a peeked poster overlay", () => {
  const poster = source("components/pick-card.tsx");
  const tv = source("components/tv-card.tsx");
  assert.match(poster, /flex min-h-9 flex-col justify-end/);
  assert.doesNotMatch(poster, /data-friend-review-row/);
  assert.doesNotMatch(tv, /data-friend-review-row|<FriendReviewBadges/);
  assert.match(
    poster,
    /hasPeeked && inCardHover !== "none"[\s\S]*?group-hover:opacity-100[\s\S]*?<FriendReviewBadges/,
  );
  assert.match(source("components/pick-card/custom-hover.tsx"), /!preview && showFriendReviews &&/);
  assert.match(source("components/hover-preview/block.tsx"), /<FriendReviewBadges/);
  assert.match(source("components/hover-preview/marquee.tsx"), /<FriendReviewBadges/);
  assert.match(
    source("themes/midnight/components/MidnightHoverPreview.tsx"),
    /<FriendReviewBadges/,
  );
});

test("all hover styles remain selectable and survive settings reloads", () => {
  const gallery = source("views/settings/hover-style-preview.tsx");
  for (const style of [
    "default",
    "marquee",
    "elegant",
    "frosted",
    "cinema",
    "spotlight",
    "custom",
  ]) {
    assert.ok(gallery.includes(`"${style}"`), `${style} can be selected`);
    const { settings } = parseStoredSettings(
      JSON.stringify({
        cardHoverStyle: style,
        hoverPreviewEnabled: false,
        _hoverPreviewOnByDefault: true,
      }),
    );
    assert.equal(settings.cardHoverStyle, style);
    assert.equal(settings.hoverPreviewEnabled, false);
  }
});

test("Peek defaults to on and existing disabled settings are migrated once", () => {
  assert.equal(parseStoredSettings(null).settings.hoverPreviewEnabled, true);
  const { settings } = parseStoredSettings(
    JSON.stringify({
      hoverPreviewEnabled: false,
      cardHoverStyle: "marquee",
    }),
  );
  assert.equal(settings.hoverPreviewEnabled, true);
  assert.equal(settings._hoverPreviewOnByDefault, true);
  assert.equal(settings.cardHoverStyle, "marquee");
  const afterOptOut = parseStoredSettings(
    JSON.stringify({ ...settings, hoverPreviewEnabled: false }),
  );
  assert.equal(afterOptOut.settings.hoverPreviewEnabled, false);
});
