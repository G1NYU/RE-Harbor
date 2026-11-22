import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { JSDOM } from "jsdom";
import { fetchDiscoveredUsers, type UserDiscoveryFilters } from "@/lib/social/user-discovery";
import { useUserDiscovery } from "@/views/user-discovery/use-user-discovery";

test("discovery sends combined server filters, search normalization and page cursors", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.endsWith("/social/users"));
    assert.equal(url.searchParams.get("q"), "friend");
    assert.equal(url.searchParams.get("sort"), "username");
    assert.equal(url.searchParams.get("rated"), "1");
    assert.equal(url.searchParams.get("canvas"), "1");
    assert.equal(url.searchParams.get("cursor"), "page-two");
    return Response.json({ users: [], total: 0 });
  });
  await fetchDiscoveredUsers(
    { query: " @friend ", sort: "username", rated: true, canvas: true },
    undefined,
    "page-two",
  );
});

test("changing discovery filters cancels pagination and keeps late results out of the new page", async (t) => {
  const dom = new JSDOM("<div id='root'></div>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const user = (id: string) => ({
    id,
    handle: id,
    displayName: id,
    verified: false,
    ratingCount: 1,
    memberSince: "2026-11-19",
    hasCanvas: false,
  });
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.has("cursor")) return pending;
    return url.searchParams.get("rated") === "1"
      ? Response.json({ users: [user("filtered")], total: 1 })
      : Response.json({ users: [user("first")], total: 2, nextCursor: "next" });
  });
  let state!: ReturnType<typeof useUserDiscovery>;
  function Harness({ filters }: { filters: UserDiscoveryFilters }) {
    state = useUserDiscovery(filters, "viewer");
    return null;
  }
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const filters = { query: "", sort: "newest", rated: false, canvas: false } as const;
  const flush = async () => {
    await React.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 330));
    });
  };
  try {
    await React.act(() => root.render(<Harness filters={filters} />));
    await flush();
    assert.equal(state.users[0].id, "first");
    let more!: Promise<void>;
    await React.act(() => {
      more = state.loadMore();
    });
    await React.act(() => root.render(<Harness filters={{ ...filters, rated: true }} />));
    await flush();
    await React.act(async () => {
      release(Response.json({ users: [user("late")], total: 2 }));
      await more;
    });
    assert.deepEqual(
      state.users.map((row) => row.id),
      ["filtered"],
    );
    assert.equal(state.loadingMore, false);
    assert.equal(state.hasMore, false);
    await React.act(() => root.render(<Harness filters={{ ...filters, query: "a" }} />));
    assert.equal(state.shortQuery, true);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
  }
});

test("match and rating sample filters reach the server and cannot silently use an older backend", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("minRatings"), "400");
    assert.equal(url.searchParams.get("minMatch"), "75");
    assert.equal(url.searchParams.get("minShared"), "50");
    return Response.json({ filterVersion: 2, users: [], total: 0 });
  });
  const filters = {
    query: "",
    sort: "username",
    rated: true,
    canvas: false,
    minRatings: 400,
    match: true,
    minMatch: 75,
    minShared: 50,
  } as const;
  await fetchDiscoveredUsers(filters);
  t.mock.method(globalThis, "fetch", async () => Response.json({ users: [], total: 0 }));
  await assert.rejects(fetchDiscoveredUsers(filters), /latest backend deployment/);
});
