import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { formatProfileJoinedAt } from "@/lib/social/profile-joined";
import { ProfileCardPanel } from "@/views/profile/profile-card-panel";
import { profileCardStyle, saveCardAppearance } from "@/lib/social/profile-card-appearance";
import { loadProfileCardSummary } from "@/lib/social/profile-card-summary";

test("join dates include the day and follow the viewer timezone without showing a time or timezone", () => {
  const at = "2026-11-18T23:30:00Z";
  assert.equal(formatProfileJoinedAt(at, "en-US", "Asia/Riyadh"), "November 19, 2026");
  assert.equal(formatProfileJoinedAt(at, "en-US", "America/Los_Angeles"), "November 18, 2026");
  assert.equal(formatProfileJoinedAt(undefined, "en-US"), null);
  assert.equal(formatProfileJoinedAt("not-a-date", "en-US"), null);
  assert.equal(formatProfileJoinedAt("1970-01-01T00:00:00Z", "en-US"), null);
});

const profile = {
  handle: "card-fixture",
  alias: "Card Fixture",
  avatarUrl: "https://example.invalid/avatar.png",
  bannerUrl: "https://example.invalid/banner.png",
  slogan: "Films, stories, and good company.",
  location: "SA",
  status: "away" as const,
  online: true,
  memberSince: "2026-11-19T00:00:00Z",
  profileCard: {
    theme: "forest",
    gradient: "linear-gradient(135deg, #10b981, #064e3b)",
    from: "#10b981",
    to: "#064e3b",
    accent: "#34d399",
    bgUrl: null,
    bgKind: null,
    customised: true,
  },
};

test("the common user panel includes banner, avatar, bio, country, presence and join date", () => {
  const dom = new JSDOM(
    renderToStaticMarkup(
      <ProfileCardPanel profile={profile} onOpen={() => {}} footer={<button>Add</button>} />,
    ),
  );
  try {
    const card = dom.window.document.querySelector("article")!;
    assert.ok(card.querySelector('img[src="https://example.invalid/banner.png"]'));
    assert.ok(card.querySelector('img[src="https://example.invalid/avatar.png"]'));
    assert.match(card.textContent!, /Films, stories, and good company/);
    assert.match(card.textContent!, /Saudi Arabia/);
    assert.match(card.textContent!, /Away/);
    assert.match(card.querySelector("time")!.textContent!, /Joined November \d+, 2026/);
    assert.equal(card.querySelector("time")!.getAttribute("title"), null);
    assert.ok(
      !card.querySelector("button button"),
      "friend controls stay outside the profile button",
    );
    assert.match(card.getAttribute("style")!, /--color-surface:#064e3b/);
  } finally {
    dom.window.close();
  }
});

test("card themes are scoped and saved through the existing profile endpoint", async (t) => {
  assert.deepEqual(profileCardStyle(), {});
  assert.equal(
    (profileCardStyle(profile.profileCard) as Record<string, string>)["--color-accent"],
    "#34d399",
  );
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (init?.method === "PATCH") {
      assert.ok(path.endsWith("/social/me/profile"));
      assert.deepEqual(JSON.parse(String(init.body)), { cardTheme: "forest" });
      return Response.json(profile);
    }
    reads++;
    assert.ok(path.endsWith("/social/u/card-fixture"));
    return Response.json({ ...profile, profileCard: undefined });
  });
  await Promise.all([
    loadProfileCardSummary(profile.handle),
    loadProfileCardSummary(profile.handle),
  ]);
  assert.equal(reads, 1, "discovery and hover share their profile read");
  await saveCardAppearance({ cardTheme: "forest" });
  const updated = await loadProfileCardSummary(profile.handle);
  assert.equal(updated.profileCard?.theme, "forest", "saving refreshes the shared card snapshot");
  assert.equal(reads, 1);
});
