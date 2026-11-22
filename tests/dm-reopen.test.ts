import "./_localstorage-stub";
import assert from "node:assert/strict";
import test from "node:test";
import { applyAuthResult } from "@/lib/theme-auth";
import {
  dmConversationById,
  openDmConversation,
  refreshDm,
  sendDmMessage,
  getDmState,
} from "@/lib/social/dm-store";

test("an opened hidden thread retains its recipient after an older server omits it from the inbox", async (t) => {
  const conversation = {
    id: "fixture-thread",
    other: { id: "friend", handle: "friend", displayName: "Friend", presence: "online" },
    unread: 0,
    muted: false,
    at: "2026-11-19T00:00:00Z",
  };
  applyAuthResult({
    token: "fixture-token",
    user: { id: "viewer", handle: "viewer", username: "viewer" },
  });
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    if (init?.method === "POST") {
      assert.equal(JSON.parse(String(init.body)).userId, "friend");
      return Response.json({ conversation });
    }
    return Response.json({ conversations: [], unread: 0 });
  });
  const opened = await openDmConversation("friend");
  assert.equal(opened.id, conversation.id);
  await refreshDm();
  assert.equal(dmConversationById(opened.id)?.other?.handle, "friend");
  assert.equal(dmConversationById(opened.id)?.other?.presence, "online");
});

test("a saved message updates the inbox immediately and an older poll cannot erase its thread", async (t) => {
  const conversation = {
    id: "saved-thread",
    other: { id: "friend", handle: "friend", displayName: "Friend" },
    unread: 0,
    muted: false,
    at: "2026-11-19T00:00:00Z",
  };
  const message = {
    id: "saved-message",
    conversationId: conversation.id,
    body: "hello",
    at: "2026-11-19T00:01:00Z",
    mine: true,
    reactions: [],
    sender: null,
  };
  let release!: (value: Response) => void;
  const stale = new Promise<Response>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    if (init?.method === "POST")
      return String(input).endsWith("/messages")
        ? Response.json(message)
        : Response.json({ conversation });
    reads++;
    if (reads === 1) return stale;
    return Response.json({
      conversations: [{ ...conversation, lastMessage: message, at: message.at }],
      unread: 0,
    });
  });
  await openDmConversation("friend");
  const poll = refreshDm({ silent: true });
  await sendDmMessage(conversation.id, "hello");
  assert.equal(
    getDmState().conversations.find((row) => row.id === conversation.id)?.lastMessage?.id,
    message.id,
  );
  release(Response.json({ conversations: [], unread: 0 }));
  await poll;
  await refreshDm({ silent: true });
  assert.equal(
    getDmState().conversations.find((row) => row.id === conversation.id)?.other?.handle,
    "friend",
  );
  assert.ok(reads >= 2, "sending schedules a fresh read after an older poll");
});
