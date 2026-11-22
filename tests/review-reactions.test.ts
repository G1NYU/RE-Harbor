import assert from "node:assert/strict";
import test from "node:test";
import { likeReview, unlikeReview } from "@/lib/social/review-reactions";

test("liking a review posts to its encoded review-ID reaction endpoint", async (t) => {
  let requested = "";
  let method = "";
  let body: unknown;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    requested = String(input);
    method = init?.method ?? "";
    body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify({ ok: true, reacted: true, count: 8 }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  const result = await likeReview("review/42");
  assert.match(requested, /\/social\/reviews\/review%2F42\/reaction$/);
  assert.equal(method, "POST");
  assert.deepEqual(body, {});
  assert.deepEqual(result, { ok: true, reacted: true, count: 8 });
});

test("unliking a review deletes its encoded reaction and returns the authoritative count", async (t) => {
  let requested = "";
  let method = "";
  t.mock.method(globalThis, "fetch", async (input, init) => {
    requested = String(input);
    method = init?.method ?? "";
    return new Response(JSON.stringify({ ok: true, reacted: false, count: 7 }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  const result = await unlikeReview("review/42");
  assert.match(requested, /\/social\/reviews\/review%2F42\/reaction$/);
  assert.equal(method, "DELETE");
  assert.deepEqual(result, { ok: true, reacted: false, count: 7 });
});
