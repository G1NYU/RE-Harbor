import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";

const output = ts.transpileModule(
  readFileSync(new URL("../src/lib/social/dm-store.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function fixture() {
  const dom = new JSDOM("");
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });
  let generation = 0;
  let author = { id: "account-a" };
  const subscribers = new Set();
  const requests = [];
  const dependencies = {
    react: {},
    "@/lib/theme-auth": {
      currentAuthor: () => author,
      captureSessionScope: () => {
        const captured = generation;
        return () => captured === generation;
      },
      subscribeAuthor: (fn) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
    },
    "./dm": {
      listDmConversations: (signal) =>
        new Promise((resolve, reject) => {
          // Deliberately ignore cancellation to exercise late-response guards too.
          requests.push({ account: author?.id, signal, resolve, reject });
        }),
      openDmConversation: async () => conversation("opened-private-thread"),
    },
  };
  const store = {};
  new Function("require", "exports", output)((name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, store);
  const stop = store.startDmPolling();
  return {
    store,
    requests,
    switchAccount(id) {
      generation++;
      author = id ? { id } : null;
      for (const fn of subscribers) fn();
    },
    updateAuthor() {
      for (const fn of subscribers) fn();
    },
    close() {
      stop();
      dom.window.close();
    },
  };
}

function conversation(id, unread = 3) {
  return {
    id,
    other: { id: "friend", handle: "friend", displayName: "Friend" },
    unread,
    muted: false,
    at: "2026-11-21T00:00:00Z",
    lastMessage: {
      id: "same-message-id",
      body: "Private",
      at: "2026-11-21T00:00:00Z",
      mine: false,
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

for (const oldFinishesFirst of [true, false]) {
  test(`account switch clears private DM state and isolates requests when the old request finishes ${oldFinishesFirst ? "first" : "last"}`, async () => {
    const f = fixture();
    const incoming = [];
    f.store.subscribeDmIncoming((event) => incoming.push(event));
    try {
      f.requests[0].resolve({ conversations: [conversation("account-a-private")], unread: 3 });
      await flush();
      await f.store.openDmConversation("friend");
      assert.equal(f.store.getDmState().unread, 3);
      const oldPoll = f.store.refreshDm();
      const old = f.requests[1];
      f.switchAccount("account-b");
      assert.deepEqual(f.store.getDmState().conversations, []);
      assert.equal(f.store.getDmState().unread, 0);
      assert.equal(f.store.getDmState().error, null);
      assert.equal(f.store.dmConversationById("opened-private-thread"), null);
      assert.equal(old.signal.aborted, true);
      assert.equal(f.requests[2].account, "account-b");
      const fresh = f.store.refreshDm();
      const settleOld = async () => {
        old.resolve({ conversations: [conversation("late-account-a")], unread: 99 });
        await oldPoll;
      };
      if (oldFinishesFirst) {
        await settleOld();
        assert.equal(f.store.getDmState().loading, true);
        void f.store.refreshDm();
        assert.equal(
          f.requests.length,
          3,
          "old finalizer must not clear the new in-flight request",
        );
      }
      f.requests[2].resolve({ conversations: [conversation("account-b-private", 5)], unread: 5 });
      await fresh;
      if (!oldFinishesFirst) await settleOld();
      assert.deepEqual(
        f.store.getDmState().conversations.map((row) => row.id),
        ["account-b-private"],
      );
      assert.equal(f.store.getDmState().unread, 5);
      assert.equal(f.store.getDmState().loading, false);
      assert.deepEqual(
        incoming,
        [],
        "the new account's existing inbox must not replay as new messages",
      );
      f.updateAuthor();
      assert.equal(f.requests.length, 3, "same-session author updates do not reset the inbox");
      assert.equal(f.store.getDmState().unread, 5);
    } finally {
      f.close();
    }
  });
}

test("logout invalidates a pending inbox and late errors cannot affect a new login", async () => {
  const f = fixture();
  try {
    const pending = f.store.refreshDm();
    f.switchAccount(null);
    assert.deepEqual(f.store.getDmState(), {
      authed: false,
      conversations: [],
      unread: 0,
      loading: false,
      error: null,
    });
    assert.equal(f.requests[0].signal.aborted, true);
    f.switchAccount("account-b");
    const fresh = f.store.refreshDm();
    f.requests[0].reject(new Error("Old account failed"));
    await pending;
    assert.equal(f.store.getDmState().error, null);
    assert.equal(f.store.getDmState().loading, true);
    f.requests[1].resolve({ conversations: [], unread: 0 });
    await fresh;
    assert.equal(f.store.getDmState().authed, true);
    assert.equal(f.store.getDmState().error, null);
  } finally {
    f.close();
  }
});

test("account changes clear the shared store even while polling is stopped", async () => {
  const f = fixture();
  try {
    f.requests[0].resolve({ conversations: [conversation("account-a-private")], unread: 3 });
    await flush();
    await f.store.openDmConversation("friend");
    f.store.startDmPolling()();
    f.switchAccount("account-b");
    assert.deepEqual(f.store.getDmState().conversations, []);
    assert.equal(f.store.getDmState().unread, 0);
    assert.equal(f.store.dmConversationById("opened-private-thread"), null);
    assert.equal(f.requests.length, 1, "stopped polling does not start background requests");
    f.store.startDmPolling();
    assert.equal(f.requests[1].account, "account-b");
    const fresh = f.store.refreshDm();
    f.requests[1].resolve({ conversations: [], unread: 0 });
    await fresh;
  } finally {
    f.store.startDmPolling()();
    f.close();
  }
});
