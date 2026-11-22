import assert from "node:assert/strict";
import test from "node:test";
import { createReviewComment, loadReviewCommentPage } from "@/lib/social/review-comment-api";

test("review comment paging encodes both review IDs and cursors and preserves totals", async (t) => {
  let requested = "";
  t.mock.method(globalThis, "fetch", async (input) => {
    requested = String(input);
    return new Response(
      JSON.stringify({
        comments: [{ id: "c2", body: "Next page", at: "2026-11-01" }],
        nextCursor: "next",
        total: 7,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });

  const page = await loadReviewCommentPage("review/42", "cursor + 1");
  assert.match(requested, /\/social\/reviews\/review%2F42\/comments\?cursor=cursor%20%2B%201$/);
  assert.equal(page.comments[0]?.id, "c2");
  assert.equal(page.nextCursor, "next");
  assert.equal(page.total, 7);
});

test("posting a review comment targets the review-ID endpoint and sends only its body", async (t) => {
  let requested = "";
  let method = "";
  let body: unknown;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    requested = String(input);
    method = init?.method || "";
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "c1", body: "A reply", at: "2026-11-01" }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  const created = await createReviewComment("review/42", "A reply");
  assert.match(requested, /\/social\/reviews\/review%2F42\/comments$/);
  assert.equal(method, "POST");
  assert.deepEqual(body, { body: "A reply" });
  assert.equal(created.id, "c1");
});
