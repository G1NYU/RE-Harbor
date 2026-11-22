import "./_localstorage-stub";
import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { JSDOM } from "jsdom";
import { applyAuthResult } from "@/lib/theme-auth";
import {
  BELL_CATEGORIES,
  bellCategoryFor,
  bellNotificationEnabled,
  currentBellPreferences,
  hydrateBellPreferences,
  normalizeBellPreferences,
  setBellPreference,
} from "@/lib/social/notification-preferences";
import { NotificationPreferences } from "@/components/notification-center/notification-preferences";

const actor = (id: string) =>
  applyAuthResult({ token: "fixture-token", user: { id, handle: id, username: id } });
test("notification categories distinguish review, profile and theme comments and keep DMs out", () => {
  const defaults = normalizeBellPreferences(null);
  assert.ok(Object.values(defaults).every(Boolean));
  assert.equal(
    bellCategoryFor({ source: "social", kind: "review_comment", title: "" }),
    "review_comments",
  );
  assert.equal(
    bellCategoryFor({ source: "social", kind: "comment", title: "" }),
    "profile_comments",
  );
  assert.equal(bellCategoryFor({ source: "theme", kind: "comment", title: "" }), "theme_comments");
  assert.equal(
    bellCategoryFor({ source: "social", kind: "friend-accepted", title: "" }),
    "friend_accepted",
  );
  assert.equal(
    bellNotificationEnabled({ source: "social", kind: "direct_message", title: "" }, defaults),
    false,
  );
  const prefs = { ...defaults, review_likes: false };
  assert.equal(
    bellNotificationEnabled({ source: "social", kind: "review_reaction", title: "" }, prefs),
    false,
  );
  assert.equal(
    bellNotificationEnabled({ source: "social", kind: "review_comment", title: "" }, prefs),
    true,
  );
});

test("choices remain account-scoped while an older backend has no preferences route", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({}, { status: 404 }));
  actor("bell-one");
  await setBellPreference("review_likes", false);
  assert.equal(currentBellPreferences().review_likes, false);
  actor("bell-two");
  assert.equal(currentBellPreferences().review_likes, true);
  actor("bell-one");
  assert.equal(currentBellPreferences().review_likes, false);
});

test("a late settings read cannot overwrite a newly saved choice", async (t) => {
  actor("bell-race");
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, "fetch", async (_input, init) =>
    init?.method === "PATCH" ? Response.json(JSON.parse(String(init.body))) : pending,
  );
  const hydrate = hydrateBellPreferences();
  await setBellPreference("review_comments", false);
  release(Response.json({ preferences: normalizeBellPreferences(null) }));
  await hydrate;
  assert.equal(currentBellPreferences().review_comments, false);
});

test("the bell settings expose every category and apply a toggle immediately", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  actor("bell-ui");
  t.mock.method(globalThis, "fetch", async (_input, init) =>
    Response.json(JSON.parse(String(init?.body))),
  );
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let updated = 0;
  try {
    await React.act(() => root.render(<NotificationPreferences onUpdated={() => updated++} />));
    assert.equal(document.querySelectorAll('[role="switch"]').length, BELL_CATEGORIES.length);
    const toggle = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Liked your review"]',
    )!;
    await React.act(async () => {
      toggle.click();
    });
    assert.equal(toggle.getAttribute("aria-checked"), "false");
    assert.equal(currentBellPreferences().review_likes, false);
    assert.equal(updated, 1);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});
