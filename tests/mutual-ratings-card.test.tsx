import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";

function loadMutualRatings(socialGet: (path: string) => Promise<unknown>) {
  const source = readFileSync(
    new URL("../src/views/ratings/mutual-ratings.tsx", import.meta.url),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const mocks: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": jsx,
    "lucide-react": { ChevronDown: () => null, Loader2: () => null },
    "@/lib/i18n": {
      useT:
        () =>
        (key: string, values: Record<string, string | number> = {}) =>
          key.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? name)),
    },
    "@/lib/social/mutual-ratings": {
      INITIAL_MUTUAL_ROWS: 20,
      fetchMutualPage: (
        handle: string,
        sort: string,
        _signal: AbortSignal,
        cursor?: string,
        withReview?: boolean,
      ) => {
        const query = new URLSearchParams({ sort });
        if (cursor) query.set("cursor", cursor);
        if (withReview) query.set("withReview", "1");
        return socialGet(`/social/u/${handle}/mutual?${query}`);
      },
      shouldUseMutualHistory: () => false,
    },
    "@/components/ratings/with-review-button": {
      WithReviewButton: ({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) =>
        React.createElement(
          "button",
          { "aria-pressed": pressed, onClick: onToggle },
          "With review",
        ),
    },
    "@/components/ratings/review-spoiler": {
      ReviewSpoiler: ({
        hidden,
        children,
        onReveal,
      }: {
        hidden: boolean;
        children: React.ReactNode;
        onReveal: () => void;
      }) =>
        hidden ? React.createElement("button", { onClick: onReveal }, "Show spoiler") : children,
    },
    "@/lib/social/review-compare": {
      reviewPresence: (mine?: string | null, theirs?: string | null) =>
        mine && theirs ? "both" : mine ? "mine-only" : theirs ? "theirs-only" : "neither",
      sharedTerms: (mine?: string | null, theirs?: string | null) =>
        mine && theirs ? ["common"] : [],
      uniqueTerms: (mine?: string | null, theirs?: string | null) =>
        mine && theirs ? (mine.startsWith("My") ? ["mine-only"] : ["theirs-only"]) : [],
    },
    "@/lib/social/mutual-score": {
      mutualScoreTone: (score: number) => ({
        text: score >= 75 ? "text-lime-400" : "text-red-400",
        ring: "ring-test",
        fill: "bg-test",
        label: score >= 75 ? "Strong similarity" : "Very different tastes",
      }),
    },
  };
  const module = { exports: {} as Record<string, unknown> };
  new Function("require", "module", "exports", outputText)(
    (name: string) => {
      assert.ok(name in mocks, `Missing mock: ${name}`);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return module.exports as {
    MutualRatings: React.ComponentType<{ handle: string }>;
  };
}

function mountHarness() {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  return {
    dom,
    root,
    close: async () => {
      await React.act(() => root.unmount());
      dom.window.close();
      for (const key of ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"])
        Reflect.deleteProperty(globalThis, key);
    },
  };
}

test("visitor sees all rateable types and expands both, one-sided, and absent reviews", async () => {
  const h = mountHarness();
  const requests: string[] = [];
  const { MutualRatings } = loadMutualRatings(async (path) => {
    requests.push(path);
    return {
      score: 82,
      count: 5,
      reviewedCount: 1,
      total: 4,
      page: [
        {
          itemKey: "anime-1",
          mediaType: "anime",
          title: "Fixture anime",
          posterUrl: "https://fixture.invalid/poster.jpg",
          myScore: 8,
          theirScore: 9,
          diff: 1,
          myReview: "My common opinion",
          theirReview: "Their common thought",
          theirSpoiler: true,
          myLikes: 0,
          theirLikes: 0,
          myComments: 0,
          theirComments: 0,
        },
        {
          itemKey: "movie-1",
          mediaType: "movie",
          title: "Fixture movie",
          myScore: 7,
          theirScore: 6,
          diff: 1,
          myReview: "Only mine",
          theirReview: null,
          myLikes: 0,
          theirLikes: 0,
          myComments: 0,
          theirComments: 0,
        },
        {
          itemKey: "series-1",
          mediaType: "series",
          title: "Fixture series",
          myScore: 5,
          theirScore: 8,
          diff: 3,
          myReview: null,
          theirReview: "Only theirs",
          myLikes: 0,
          theirLikes: 0,
          myComments: 0,
          theirComments: 0,
        },
        {
          itemKey: "manga-1",
          mediaType: "manga",
          title: "Fixture manga",
          myScore: 9,
          theirScore: 9,
          diff: 0,
          myReview: null,
          theirReview: null,
          myLikes: 0,
          theirLikes: 0,
          myComments: 0,
          theirComments: 0,
        },
      ],
    };
  });

  try {
    await React.act(async () => {
      h.root.render(React.createElement(MutualRatings, { handle: "friend" }));
      await Promise.resolve();
    });
    const body = h.dom.window.document.body;
    assert.match(body.textContent || "", /82%/);
    assert.match(body.textContent || "", /Based on 5 mutual ratings/);
    assert.match(body.textContent || "", /Fixture anime/);
    assert.match(body.textContent || "", /Fixture movie/);
    assert.match(body.textContent || "", /Fixture series/);
    assert.match(body.textContent || "", /Fixture manga/);
    assert.match(body.textContent || "", /You 8\/10/);
    assert.match(body.textContent || "", /Them 9\/10/);
    assert.match(body.textContent || "", /1 apart/);
    const scoreBadge = [...body.querySelectorAll("div")].find((element) =>
      element.className.includes("h-16 w-16"),
    );
    assert.ok(scoreBadge, "the percentage uses the prominent circular score badge");
    assert.ok(scoreBadge.textContent?.includes("82%"));
    assert.match(requests[0] || "", /\/social\/u\/friend\/mutual\?/);
    assert.equal(
      body.querySelector("img")?.getAttribute("src"),
      "https://fixture.invalid/poster.jpg",
    );

    const expandTitle = async (title: string) => {
      const button = [...body.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes(title),
      );
      assert.ok(button, `comparison button for ${title}`);
      await React.act(() => button.click());
    };
    await expandTitle("Fixture anime");
    assert.match(body.textContent || "", /My common opinion/);
    assert.doesNotMatch(body.textContent || "", /Their common thought|Words both reviews use/);
    const reveal = [...body.querySelectorAll("button")].find(
      (button) => button.textContent === "Show spoiler",
    );
    assert.ok(reveal);
    await React.act(() => reveal.click());
    assert.match(body.textContent || "", /Their common thought/);
    assert.match(body.textContent || "", /Words both reviews use: common/);
    assert.match(body.textContent || "", /Words only your review uses: mine-only/);
    assert.match(body.textContent || "", /Words only their review uses: theirs-only/);
    assert.match(body.textContent || "", /not interpreted opinions/);
    assert.match(body.textContent || "", /The match score uses the numbers only/);
    await expandTitle("Fixture movie");
    assert.match(body.textContent || "", /Only you wrote a review for this title/);
    await expandTitle("Fixture series");
    assert.match(body.textContent || "", /Only they wrote a review for this title/);
    await expandTitle("Fixture manga");
    assert.ok((body.textContent?.match(/No written review/g) ?? []).length >= 2);
    const filter = [...body.querySelectorAll("button")].find(
      (button) => button.textContent === "With review",
    );
    assert.ok(filter);
    await React.act(() => filter.click());
    assert.match(requests.at(-1) || "", /withReview=1/);
    assert.match(body.textContent || "", /82%/);
  } finally {
    await h.close();
  }
});

test("a visitor with no mutual ratings sees an empty state without a percentage", async () => {
  const h = mountHarness();
  let requests = 0;
  const { MutualRatings } = loadMutualRatings(async () => {
    requests += 1;
    return { score: null, count: 0, reviewedCount: 0, total: 0, page: [] };
  });

  try {
    await React.act(async () => {
      h.root.render(React.createElement(MutualRatings, { handle: "friend" }));
      await Promise.resolve();
    });
    assert.equal(requests, 1);
    assert.match(h.dom.window.document.body.textContent || "", /Not enough shared ratings yet/);
    assert.match(h.dom.window.document.body.textContent || "", /0 mutual ratings/);
    assert.doesNotMatch(h.dom.window.document.body.textContent || "", /0%/);
  } finally {
    await h.close();
  }
});
