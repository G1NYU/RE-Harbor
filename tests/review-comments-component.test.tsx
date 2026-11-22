import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";

function loadReviewComments(dependencies: Record<string, unknown>) {
  const source = readFileSync(
    new URL("../src/components/ratings/review-comments.tsx", import.meta.url),
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
    "lucide-react": { Loader2: () => null, Reply: () => null },
    "@/lib/i18n": { useT: () => (key: string) => key },
    ...dependencies,
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
    ReviewComments: React.ComponentType<{ reviewId: string; onCount?: (count: number) => void }>;
    ReviewDiscussion: React.ComponentType<{ reviewId?: string }>;
  };
}

test("review comments show server counts, load the next cursor, and reconcile a new reply", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const pageCalls: Array<string | undefined> = [];
  const countUpdates: number[] = [];
  const engagementUpdates: unknown[] = [];
  const { ReviewComments, ReviewDiscussion } = loadReviewComments({
    "@/lib/theme-auth": { authToken: () => "fixture-token" },
    "@/lib/ratings/quote": { parseQuotedBody: (body: string) => ({ text: body }) },
    "@/views/profile/comment-compose": {
      CommentCompose: ({ onSubmit }: { onSubmit: (body: string) => Promise<unknown> }) =>
        React.createElement("button", { onClick: () => void onSubmit("A reply") }, "Post reply"),
    },
    "@/views/profile/profile-bits": {
      Avatar: () => React.createElement("span"),
      timeAgo: () => "today",
    },
    "@/views/profile/user-hover-card": { UserHoverCard: ({ children }: any) => children },
    "@/lib/social/open-profile": { requestOpenProfile: () => {} },
    "@/lib/social/review-engagement": {
      useReviewEngagement: () => ({
        value: {},
        update: (patch: unknown) => engagementUpdates.push(patch),
      }),
    },
    "@/views/profile/text-safety": {
      COMMENT_MAX: 1000,
      segmentProfanity: (text: string) => [{ text, masked: false }],
      stripUrls: (text: string) => text,
      validateComment: () => null,
    },
    "@/lib/social/review-comment-api": {
      loadReviewCommentPage: async (_id: string, cursor?: string) => {
        pageCalls.push(cursor);
        return cursor
          ? {
              comments: [
                { id: "c2", body: "Second reply", at: "2026-11-17", author: { handle: "friend" } },
              ],
              total: 3,
            }
          : {
              comments: [
                { id: "c1", body: "First reply", at: "2026-11-17", author: { handle: "friend" } },
              ],
              nextCursor: "cursor-2",
              total: 3,
            };
      },
      createReviewComment: async (_id: string, body: string) => ({
        id: "c3",
        body,
        at: "2026-11-17",
        author: { handle: "viewer" },
      }),
    },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = () =>
    React.createElement(ReviewComments, {
      reviewId: "review-1",
      onCount: (count: number) => countUpdates.push(count),
    });

  try {
    await React.act(async () => root.render(React.createElement(ReviewDiscussion)));
    assert.match(dom.window.document.body.textContent || "", /Review comments are unavailable/);
    assert.equal(pageCalls.length, 0);

    await React.act(async () => {
      root.render(render());
      await Promise.resolve();
    });
    assert.match(dom.window.document.body.textContent || "", /First reply/);
    assert.equal(countUpdates.at(-1), 3);

    const more = [...dom.window.document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Show more comments"),
    );
    assert.ok(more);
    await React.act(async () => {
      more.click();
      await Promise.resolve();
    });
    assert.deepEqual(pageCalls, [undefined, "cursor-2"]);
    assert.match(dom.window.document.body.textContent || "", /Second reply/);

    const post = [...dom.window.document.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Post reply"),
    );
    assert.ok(post);
    await React.act(async () => {
      post.click();
      await Promise.resolve();
    });
    assert.match(dom.window.document.body.textContent || "", /A reply/);
    assert.equal(countUpdates.at(-1), 4);
    assert.deepEqual(engagementUpdates, [{ comments: 4, threadChanged: true }]);
  } finally {
    await React.act(() => root.unmount());
    dom.window.close();
    for (const key of ["window", "document", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"])
      Reflect.deleteProperty(globalThis, key);
  }
});
