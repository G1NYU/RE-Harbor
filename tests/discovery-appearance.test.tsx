import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { JSDOM } from "jsdom";
import { ProfileCardColors } from "@/views/profile/profile-card-colors";
import { ProfileCardPanel } from "@/views/profile/profile-card-panel";
import { DiscoveryUserCard } from "@/views/user-discovery/user-card";
import {
  publishProfileCardSummary,
  loadProfileCardSummary,
} from "@/lib/social/profile-card-summary";
import { saveCardAppearance } from "@/lib/social/profile-card-appearance";
import type { ProfileSummary } from "@/views/profile/profile-types";
import type { CardAppearancePatch } from "@/lib/social/profile-card-appearance";
import { renderToStaticMarkup } from "react-dom/server";

const profile = {
  handle: "appearance-fixture",
  alias: "Fixture",
  slogan: "Fixture bio",
  memberSince: "2026-11-20",
  friendStatus: "outgoing",
  profileCard: {
    theme: "forest",
    from: "#10b981",
    to: "#064e3b",
    gradient: "linear-gradient(135deg, #10b981, #064e3b)",
    accent: "#34d399",
    customised: true,
    bgUrl: null,
    bgKind: null,
  },
} as ProfileSummary;

function setup() {
  const dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  return dom;
}

test("card editor previews its theme on the whole card and saves separate text colors", async () => {
  const dom = setup();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let saved: CardAppearancePatch | undefined;
  try {
    await React.act(() =>
      root.render(
        <ProfileCardColors
          profile={profile}
          busy={false}
          onApply={async (patch) => {
            saved = patch;
          }}
        />,
      ),
    );
    const button = (label: string) =>
      [...document.querySelectorAll("button")].find((item) => item.textContent === label)!;
    assert.ok(!document.querySelector('input[aria-label="Accent"]'));
    for (const label of ["Name", "Handle", "Bio", "Other text", "Theme color 1", "Theme color 2"])
      assert.ok(document.querySelector(`input[aria-label="${label}"]`));
    await React.act(() => button("Aurora").click());
    assert.equal(
      (document.querySelector("article") as HTMLElement).style.backgroundImage,
      "linear-gradient(135deg, rgb(34, 211, 238), rgb(79, 70, 229))",
    );
    await React.act(() => button("Solid color").click());
    assert.ok(document.querySelector('input[aria-label="Theme color"]'));
    assert.equal(document.querySelector('input[aria-label="Theme color 2"]'), null);
    await React.act(() => button("Apply appearance").click());
    assert.equal(saved?.cardTheme, "custom");
    assert.equal(saved?.cardFrom, "#22d3ee");
    assert.equal(saved?.cardTo, "#22d3ee");
    assert.equal(saved?.cardNameColor, "#f7f7fa");
    assert.equal(saved?.cardHandleColor, "#a5a5b4");
    assert.equal(saved?.cardBioColor, "#c6c6d0");
    assert.equal(saved?.cardTextColor, "#c6c6d0");
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("banners suppress the shine and each identity text has its own color", () => {
  const look = {
    ...profile.profileCard!,
    nameColor: "#111111",
    handleColor: "#222222",
    bioColor: "#333333",
    textColor: "#444444",
  };
  const markup = renderToStaticMarkup(
    <ProfileCardPanel
      profile={{ ...profile, bannerUrl: "https://example.invalid/banner.png", profileCard: look }}
    />,
  );
  assert.ok(!markup.includes("radial-gradient"));
  for (const token of [
    "--profile-card-name:#111111",
    "--profile-card-handle:#222222",
    "--profile-card-bio:#333333",
    "--color-ink:#444444",
  ])
    assert.ok(markup.includes(token));
  assert.match(renderToStaticMarkup(<ProfileCardPanel profile={profile} />), /radial-gradient/);
});

test("a pending discovery card cancels the request and updates the shared profile snapshot", async (t) => {
  const dom = setup();
  publishProfileCardSummary(profile);
  t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.ok(String(input).endsWith("/social/friends/remove"));
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { handle: profile.handle });
    return Response.json({ ok: true });
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const user = {
    id: "appearance-user",
    handle: profile.handle,
    displayName: profile.alias,
    verified: false,
    memberSince: "2026-11-20",
    ratingCount: 400,
    hasCanvas: false,
    friendStatus: "outgoing" as const,
  };
  try {
    await React.act(() =>
      root.render(
        <DiscoveryUserCard user={user} friend={false} signedIn={true} onOpen={() => {}} />,
      ),
    );
    const pending = document.querySelector('button[title="Cancel request"]') as HTMLButtonElement;
    assert.equal(pending.textContent, "Requested");
    await React.act(() => pending.click());
    assert.equal((await loadProfileCardSummary(profile.handle)).friendStatus, "none");
    assert.ok([...document.querySelectorAll("button")].some((item) => item.textContent === "Add"));
    await React.act(() => root.unmount());
    const second = createRoot(document.getElementById("root")!);
    await React.act(() =>
      second.render(
        <DiscoveryUserCard
          user={{ ...user, friendStatus: "none" }}
          friend={false}
          signedIn={true}
          onOpen={() => {}}
        />,
      ),
    );
    assert.ok([...document.querySelectorAll("button")].some((item) => item.textContent === "Add"));
    await React.act(() => second.unmount());
  } finally {
    dom.window.close();
  }
});

test("a backend that ignores card color fields cannot report a successful save", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json(profile));
  await assert.rejects(
    saveCardAppearance({ cardTheme: "forest", cardNameColor: "#123456" }),
    /latest backend deployment/,
  );
});
