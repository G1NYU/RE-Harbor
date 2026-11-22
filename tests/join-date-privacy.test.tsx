import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileJoinedAt } from "@/views/profile/profile-joined-at";
import { ProfileCardPanel } from "@/views/profile/profile-card-panel";
import { DiscoveryUserCard } from "@/views/user-discovery/user-card";
import { saveSettings } from "@/views/profile/profile-api";
import { loadProfileCardSummary } from "@/lib/social/profile-card-summary";
import type { ProfileSettingsInput, ProfileSummary } from "@/views/profile/profile-types";

const profile = {
  handle: "join-fixture",
  alias: "Join Fixture",
  memberSince: "2026-11-20T00:00:00Z",
} as ProfileSummary;
test("join dates default to visible and explicit hiding omits the date and time element", () => {
  assert.match(renderToStaticMarkup(<ProfileJoinedAt value={profile.memberSince} />), /Joined/);
  assert.equal(
    renderToStaticMarkup(<ProfileJoinedAt value={profile.memberSince} show={false} />),
    "",
  );
  const hidden = renderToStaticMarkup(
    <ProfileCardPanel profile={{ ...profile, showJoinDate: false }} />,
  );
  assert.ok(!hidden.includes("<time"));
  assert.ok(!hidden.includes("2026-11-20"));
  assert.match(renderToStaticMarkup(<ProfileCardPanel profile={profile} />), /<time/);
});
test("discovery fallback cards respect hidden dates before a richer summary loads", () => {
  const user = {
    id: "join-id",
    handle: profile.handle,
    displayName: profile.alias,
    verified: false,
    memberSince: profile.memberSince,
    showJoinDate: false,
    ratingCount: 0,
    hasCanvas: false,
  };
  const markup = renderToStaticMarkup(
    <DiscoveryUserCard user={user} friend={false} signedIn onOpen={() => {}} />,
  );
  assert.ok(!markup.includes("<time"));
});
test("saving join-date privacy confirms server persistence and refreshes shared card data", async (t) => {
  t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.ok(String(input).endsWith("/social/me/profile"));
    assert.equal(init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init?.body)), { showJoinDate: false });
    return Response.json({ ...profile, showJoinDate: false });
  });
  const summary = await saveSettings({ showJoinDate: false } as ProfileSettingsInput);
  assert.equal(summary.showJoinDate, false);
  assert.equal((await loadProfileCardSummary(profile.handle)).showJoinDate, false);
  t.mock.method(globalThis, "fetch", async () => Response.json(profile));
  await assert.rejects(
    saveSettings({ showJoinDate: false } as ProfileSettingsInput),
    /latest backend deployment/,
  );
});
