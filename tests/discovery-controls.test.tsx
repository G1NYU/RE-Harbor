import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { JSDOM } from "jsdom";
import {
  DiscoveryControls,
  DEFAULT_DISCOVERY_OPTIONS,
  type DiscoveryOptions,
} from "@/views/user-discovery/discovery-controls";
import { fetchDiscoveredUsers } from "@/lib/social/user-discovery";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileThemePicker } from "@/views/profile/profile-theme-picker";
import type { ProfileSummary } from "@/views/profile/profile-types";

test("match presets, custom profiles, member sorts and Refresh work together", async () => {
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.matchMedia = () => ({ matches: true }) as MediaQueryList;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let selected!: DiscoveryOptions;
  let refreshes = 0;
  function Harness() {
    const [options, change] = React.useState(DEFAULT_DISCOVERY_OPTIONS);
    selected = options;
    return (
      <DiscoveryControls
        options={options}
        onChange={change}
        onRefresh={() => refreshes++}
        signedIn
        loading={false}
      />
    );
  }
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find((item) => item.textContent === name)!;
  try {
    await React.act(() => root.render(<Harness />));
    assert.equal(document.body.textContent?.includes("Has ratings"), false);
    assert.ok(button("Custom profile").title.includes("HTML/CSS"));
    await React.act(() => button("Custom profile").click());
    assert.equal(selected.canvas, true);
    assert.equal(button("Custom profile").getAttribute("aria-pressed"), "true");
    await React.act(() =>
      (document.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement).click(),
    );
    const chooseSort = async (name: string) => {
      const item = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent === name,
      )!;
      assert.ok(item, name);
      await React.act(() => (item as HTMLElement).click());
    };
    await chooseSort("Newest members");
    assert.deepEqual(selected.orders, ["newest"]);
    await chooseSort("Oldest members");
    assert.deepEqual(selected.orders, ["oldest"]);
    await chooseSort("Written reviews");
    assert.deepEqual(selected.orders, ["reviews"]);
    await chooseSort("Recent activity");
    assert.deepEqual(selected.orders, ["reviews", "activity"]);
    await chooseSort("Newest members");
    assert.deepEqual(selected.orders, ["newest"]);
    await React.act(() =>
      (document.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement).click(),
    );
    for (const score of [75, 50, 25]) {
      await React.act(() => button(score + "% Match & above").click());
      assert.equal(selected.minMatch, score);
      assert.equal(selected.minShared, 10);
      assert.equal(button(score + "% Match & above").getAttribute("aria-pressed"), "true");
    }
    await React.act(() =>
      (
        document.querySelector('button[aria-label="Customize filters"]') as HTMLButtonElement
      ).click(),
    );
    assert.ok(document.querySelector('input[aria-label="Minimum shared titles"]'));
    await React.act(() => button("Refresh").click());
    assert.equal(refreshes, 1);
    assert.equal(selected.minMatch, 25, "refresh keeps filters");
    assert.equal(selected.canvas, true, "refresh keeps custom-profile filtering");
    await React.act(() => button("Clear filters").click());
    await React.act(() => button("Refresh").click());
    assert.equal(refreshes, 2, "refresh works without match or sort selections");
    assert.deepEqual(selected.orders, []);
    assert.equal(selected.canvas, false);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("shuffle seed and combined sort order reach the API and unsupported servers cannot silently ignore them", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("order"), "activity,reviews");
    assert.equal(url.searchParams.get("seed"), "refresh-seed");
    return Response.json({ filterVersion: 3, users: [], total: 0 });
  });
  const filters = {
    query: "",
    sort: "activity",
    orders: ["activity", "reviews"],
    seed: "refresh-seed",
    rated: false,
    canvas: false,
  } as const;
  await fetchDiscoveredUsers({ ...filters, orders: [...filters.orders] });
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ filterVersion: 2, users: [], total: 0 }),
  );
  await assert.rejects(
    fetchDiscoveredUsers({ ...filters, orders: [...filters.orders] }),
    /latest backend deployment/,
  );
});

test("profile theme settings no longer include a profile display or preview label", () => {
  const markup = renderToStaticMarkup(
    <ProfileThemePicker
      summary={{ handle: "fixture", alias: "Fixture" } as ProfileSummary}
      onSaved={() => {}}
    />,
  );
  assert.ok(!markup.includes('aria-label="Profile appearance"'));
  assert.ok(!markup.includes("Live preview"));
  assert.ok(!markup.includes("Hours watched"));
});

test("written-review direction is interactive only for a sole written-review sort", async () => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  let selected!: DiscoveryOptions;
  let change!: React.Dispatch<React.SetStateAction<DiscoveryOptions>>;
  function Harness() {
    const [options, set] = React.useState<DiscoveryOptions>({
      ...DEFAULT_DISCOVERY_OPTIONS,
      orders: ["reviews"],
    });
    selected = options;
    change = set;
    return (
      <DiscoveryControls
        options={options}
        onChange={set}
        onRefresh={() => {}}
        signedIn
        loading={false}
      />
    );
  }
  try {
    await React.act(() => root.render(<Harness />));
    const customize = document.querySelector('button[aria-label="Customize filters"]')!;
    assert.equal(customize.textContent, "");
    await React.act(() =>
      (
        document.querySelector(
          'button[aria-label="Show least written reviews first"]',
        ) as HTMLButtonElement
      ).click(),
    );
    assert.equal(selected.reviewDirection, "asc");
    await React.act(() =>
      (
        document.querySelector(
          'button[aria-label="Show most written reviews first"]',
        ) as HTMLButtonElement
      ).click(),
    );
    assert.equal(selected.reviewDirection, "desc");
    await React.act(() => change((previous) => ({ ...previous, orders: ["reviews", "activity"] })));
    assert.equal(
      (
        document.querySelector(
          'button[aria-label="Select only Written reviews to change order"]',
        ) as HTMLButtonElement
      ).disabled,
      true,
    );
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("ascending review order reaches the backend only for the sole review sort", async (t) => {
  let query: URLSearchParams;
  t.mock.method(globalThis, "fetch", async (input) => {
    query = new URL(String(input)).searchParams;
    return Response.json({ filterVersion: 4, users: [], total: 0 });
  });
  const filters = {
    query: "",
    sort: "reviews",
    orders: ["reviews"],
    reviewDirection: "asc",
    rated: false,
    canvas: false,
  } as const;
  await fetchDiscoveredUsers({ ...filters, orders: [...filters.orders] });
  assert.equal(query!.get("reviewDirection"), "asc");
  await fetchDiscoveredUsers({ ...filters, orders: ["reviews", "activity"] });
  assert.equal(query!.has("reviewDirection"), false);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ filterVersion: 3, users: [], total: 0 }),
  );
  await assert.rejects(
    fetchDiscoveredUsers({ ...filters, orders: [...filters.orders] }),
    /latest backend deployment/,
  );
});

test("restored member sorts and custom profile filtering use the existing backend contract", async (t) => {
  let query!: URLSearchParams;
  t.mock.method(globalThis, "fetch", async (input) => {
    query = new URL(String(input)).searchParams;
    return Response.json({ filterVersion: 4, users: [], total: 0 });
  });
  for (const sort of ["newest", "oldest"] as const) {
    await fetchDiscoveredUsers({
      query: "",
      sort,
      orders: [sort],
      seed: "restored",
      canvas: true,
      rated: true,
      minRatings: 400,
      match: true,
      minMatch: 75,
      minShared: 30,
    });
    assert.equal(query.get("sort"), sort);
    assert.equal(
      query.has("order"),
      false,
      "legacy date sorts must not send unsupported combined orders",
    );
    assert.equal(query.get("canvas"), "1");
    assert.equal(query.get("minRatings"), "400");
    assert.equal(query.get("minMatch"), "75");
    assert.equal(query.get("minShared"), "30");
  }
});
