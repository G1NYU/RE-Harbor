import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeDirectoryUsers,
  directoryMatchScore,
  excludeDirectoryUsers,
  looksLikeHandle,
  normalizeQuery,
  pageUsers,
  rankDirectoryUsers,
  type DirectoryUser,
} from "../src/lib/social/directory-rank";
import {
  friendRowLabel,
  friendRowState,
  isAlreadyRelatedError,
  resolveQuickFriendship,
  visibleQuickFriendship,
} from "../src/lib/social/friend-request";

const betterAhmed: DirectoryUser = { handle: "BetterAhmed", alias: "Ahmed" };
const betterCallSaul: DirectoryUser = { handle: "BetterCallSaul", alias: "Saul" };
const both = [betterAhmed, betterCallSaul];

test("partial handles match the documented prefix table", () => {
  const handles = (q: string) => rankDirectoryUsers(both, q).map((u) => u.handle);
  assert.deepEqual(handles("B").sort(), ["BetterAhmed", "BetterCallSaul"]);
  assert.deepEqual(handles("Be").sort(), ["BetterAhmed", "BetterCallSaul"]);
  assert.deepEqual(handles("Better").sort(), ["BetterAhmed", "BetterCallSaul"]);
  assert.deepEqual(handles("BetterA"), ["BetterAhmed"]);
  assert.deepEqual(handles("BetterC"), ["BetterCallSaul"]);
  assert.deepEqual(handles("BetterAhmed"), ["BetterAhmed"]);
});

test("matching is case-insensitive and tolerates a leading @", () => {
  assert.deepEqual(
    rankDirectoryUsers(both, "bEtTeRc").map((u) => u.handle),
    ["BetterCallSaul"],
  );
  assert.deepEqual(
    rankDirectoryUsers(both, "@BetterA").map((u) => u.handle),
    ["BetterAhmed"],
  );
  assert.equal(normalizeQuery("  @@BetterA "), "bettera");
});

test("non-prefix substrings still match, ranked below prefixes", () => {
  const users: DirectoryUser[] = [
    { handle: "xcallme", alias: "Someone" },
    { handle: "CallMeMaybe", alias: "Maybe" },
  ];
  assert.deepEqual(
    rankDirectoryUsers(users, "call").map((u) => u.handle),
    ["CallMeMaybe", "xcallme"],
  );
  assert.equal(directoryMatchScore(users[0], "call"), 4);
});

test("aliases and word starts are searchable, and misses are excluded", () => {
  assert.deepEqual(
    rankDirectoryUsers(both, "saul").map((u) => u.handle),
    ["BetterCallSaul"],
  );
  assert.equal(rankDirectoryUsers(both, "zzzz").length, 0);
  assert.equal(directoryMatchScore(betterAhmed, ""), 0);
});

test("an empty query returns a browse order, online first then alphabetical", () => {
  const users: DirectoryUser[] = [
    { handle: "zoe", alias: "Zoe", online: false },
    { handle: "amy", alias: "Amy", online: true },
    { handle: "bob", alias: "Bob", online: false },
  ];
  assert.deepEqual(
    rankDirectoryUsers(users, "").map((u) => u.handle),
    ["amy", "bob", "zoe"],
  );
});

test("ranking respects the result limit", () => {
  const many = Array.from({ length: 80 }, (_, i) => ({
    handle: `user${i}`,
    alias: `User ${i}`,
  }));
  assert.equal(rankDirectoryUsers(many, "user", 10).length, 10);
  assert.equal(rankDirectoryUsers(many, "").length, 60);
});

test("dedupe is case-insensitive and merges sources and missing fields", () => {
  const merged = dedupeDirectoryUsers([
    { handle: "Naif", alias: "naif", sources: ["group"] },
    { handle: "naif", avatarUrl: "https://cdn/a.webp", sources: ["friend-of-friend"] },
    { handle: "  ", alias: "blank" },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].avatarUrl, "https://cdn/a.webp");
  assert.deepEqual([...new Set(merged[0].sources)].sort(), ["friend-of-friend", "group"]);
});

test("the signed-in user, friends and pending requests are excluded", () => {
  const users: DirectoryUser[] = [
    { handle: "me", alias: "Me" },
    { handle: "Friend1", alias: "F" },
    { handle: "pending1", alias: "P" },
    { handle: "new", alias: "N" },
  ];
  const kept = excludeDirectoryUsers(users, {
    self: "ME",
    exclude: ["friend1", "Pending1"],
  });
  assert.deepEqual(
    kept.map((u) => u.handle),
    ["new"],
  );
});

test("pagination slices without dropping the remainder", () => {
  const users = Array.from({ length: 30 }, (_, i) => ({ handle: `u${i}`, alias: `U${i}` }));
  const first = pageUsers(users, 12);
  assert.equal(first.items.length, 12);
  assert.equal(first.hasMore, true);
  const all = pageUsers(users, 60);
  assert.equal(all.items.length, 30);
  assert.equal(all.hasMore, false);
});

test("handle-shaped queries are the only ones worth an exact profile lookup", () => {
  assert.equal(looksLikeHandle("betterahmed"), true);
  assert.equal(looksLikeHandle("@BetterAhmed"), true);
  assert.equal(looksLikeHandle("a"), false);
  assert.equal(looksLikeHandle("two words"), false);
  assert.equal(looksLikeHandle("   "), false);
});

test("row state reflects self, friends and pending requests", () => {
  const opts = { self: "Me", friends: ["Friend"], pending: ["Waiting"] };
  assert.equal(friendRowState("me", opts), "self");
  assert.equal(friendRowState("FRIEND", opts), "friends");
  assert.equal(friendRowState("waiting", opts), "requested");
  assert.equal(friendRowState("stranger", opts), "idle");
  assert.equal(friendRowState("stranger", { ...opts, local: { stranger: "sending" } }), "sending");
});

test("an already-related rejection is treated as settled, not as an error", () => {
  assert.equal(isAlreadyRelatedError(new Error("Already friends")), true);
  assert.equal(isAlreadyRelatedError(new Error("pending request exists")), true);
  assert.equal(isAlreadyRelatedError(new Error("Network unreachable")), false);
});

test("Quick Access relationship resolution treats server friend and pending states as settled", () => {
  assert.deepEqual(resolveQuickFriendship("Friend", "friends", {}), {
    state: "friends",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Waiting", "incoming", {}), {
    state: "requested",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Waiting", "outgoing", {}), {
    state: "requested",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Blocked", "blocked", {}), {
    state: "blocked",
    known: true,
  });
});

test("Quick Access relationship resolution stays disabled when both list reads fail", () => {
  assert.deepEqual(resolveQuickFriendship("Friend", undefined, {}), {
    state: "idle",
    known: false,
  });
  assert.deepEqual(resolveQuickFriendship("Friend", undefined, { friends: [], pending: [] }), {
    state: "idle",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Me", undefined, { self: "me" }), {
    state: "self",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Stranger", "none", {}), {
    state: "idle",
    known: true,
  });
});

test("a positive result from either available list is enough to settle the relationship", () => {
  assert.deepEqual(resolveQuickFriendship("Friend", undefined, { friends: ["FRIEND"] }), {
    state: "friends",
    known: true,
  });
  assert.deepEqual(resolveQuickFriendship("Waiting", undefined, { pending: ["waiting"] }), {
    state: "requested",
    known: true,
  });
  assert.equal(resolveQuickFriendship("Friend", undefined, { friends: [] }).known, false);
});

test("Quick Access hides a previous user's friend indicator while new state is unresolved", () => {
  assert.equal(visibleQuickFriendship("friends", false), "idle");
  assert.equal(visibleQuickFriendship("friends", true), "friends");
});

test("Quick Access friend state uses the specified tooltip wording", () => {
  assert.equal(friendRowLabel("friends"), "This user is your friend.");
  assert.equal(friendRowLabel("requested"), "Friend request pending");
  assert.equal(friendRowLabel("blocked"), "This user is blocked.");
  assert.equal(friendRowLabel("sending"), "Sending friend request…");
});
