import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const output = ts.transpileModule(
  readFileSync(new URL("../src/lib/social/dm-preferences.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function fixture() {
  const originalStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
  };

  let generation = 0;
  let author = { id: "account-a", handle: "alice" };
  const patches = [];
  const dependencies = {
    react: {},
    "@/lib/theme-auth": {
      currentAuthor: () => author,
      captureSessionScope: () => {
        const captured = generation;
        return () => captured === generation;
      },
    },
    "./client": {
      socialGet: async () => ({}),
      socialPatch: (path, body) =>
        new Promise((resolve, reject) => {
          patches.push({ path, body, resolve, reject, account: author.id });
        }),
    },
  };
  const api = {};
  new Function("require", "exports", output)((name) => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, api);

  return {
    api,
    storage,
    patches,
    switchAccount(id, handle) {
      generation++;
      author = { id, handle };
    },
    cleanup() {
      if (originalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalStorage;
    },
  };
}

test("a rejected old-account DM policy save cannot roll back the new account", async () => {
  const f = fixture();
  try {
    const oldSave = f.api.saveDmPolicy("everyone");
    assert.equal(f.patches.length, 1);
    assert.equal(f.patches[0].account, "account-a");
    assert.deepEqual(f.patches[0].body, { dmPolicy: "everyone" });
    assert.equal(f.api.currentDmPolicy(), "everyone");

    f.switchAccount("account-b", "bob");
    f.api.applyDmPrefsFromSummary({ dmPolicy: "everyone" });
    assert.equal(f.api.currentDmPolicy(), "everyone");

    f.patches[0].reject(new Error("Account changed"));
    await assert.rejects(oldSave, /Account changed/);

    assert.equal(f.api.currentDmPolicy(), "everyone");
    assert.equal(f.storage.get("harbor.dm.policy"), "everyone");
  } finally {
    f.cleanup();
  }
});

test("a failed DM policy save still rolls back for the current account", async () => {
  const f = fixture();
  try {
    const save = f.api.saveDmPolicy("everyone");
    assert.equal(f.api.currentDmPolicy(), "everyone");
    f.patches[0].reject(new Error("Server rejected update"));
    await assert.rejects(save, /Server rejected update/);
    assert.equal(f.api.currentDmPolicy(), "friends");
    assert.equal(f.storage.get("harbor.dm.policy"), "friends");
  } finally {
    f.cleanup();
  }
});

test("a successful DM policy save remains selected and persisted", async () => {
  const f = fixture();
  try {
    const save = f.api.saveDmPolicy("everyone");
    f.patches[0].resolve({});
    await save;
    assert.equal(f.api.currentDmPolicy(), "everyone");
    assert.equal(f.storage.get("harbor.dm.policy"), "everyone");
  } finally {
    f.cleanup();
  }
});
