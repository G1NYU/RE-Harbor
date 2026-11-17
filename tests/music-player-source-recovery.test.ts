import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { shouldResolvePreferredSource } from "../src/lib/music/source-version";
import { adoptRequestedIdentity } from "../src/lib/music/queue-source";
import { queueTrackKey } from "../src/lib/music/queue-order";
import { sameMusicTrack } from "../src/lib/music/track-identity";
import type { MusicTrack } from "../src/lib/music/types";

const spotify: MusicTrack = {
  id: "spotify:track:one", connectorId: "spotify", title: "One", artist: "Artist",
  artwork: "", durationSeconds: 180, durationLabel: "3:00",
};
const alternative: MusicTrack = { ...spotify, id: "soundcloud:one", connectorId: "soundcloud" };

function fixture(failImmediately = false, exhaustedCache = false, failure = "Spotify unavailable", lookupGate?: Promise<void>) {
  const source = readFileSync(new URL("../src/lib/music/player.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("player.ts", source, ts.ScriptTarget.Latest, true);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) &&
    ["playMusic", "nextPlayableSource", "recoverySources"].includes(node.name?.text ?? ""));
  const declarations = `let explicitSource=null, playRequest=0, observedPause=null, resumeAt=null,
    recoverPlayback=null, audioReady=null, enginePrimed=false, pendingSpeakerDevice=null,
    returningToComputer=false, speakerTransfer=false; const autoSkipped=new Set();
    const SOURCE_ATTEMPT_CEILING=6, SOURCE_TTL_MS=120000;
    export const failLater=(message)=>recoverPlayback?.(message);`;
  const output = ts.transpileModule(declarations + functions.map(node => node.getText(tree)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const state = { phase: "idle", current: null as MusicTrack | null, queue: [] as MusicTrack[],
    queueIndex: 0, volume: .5, recents: [], likedIds: [], likedTracks: [], error: null };
  const attempts: MusicTrack[] = [];
  let lookups = 0;
  const scope = {
    state, queueTrackKey, shouldResolvePreferredSource, adoptRequestedIdentity, sameMusicTrack,
    initializeMusic: async () => {}, cancelMusicQueueAutomation: () => {},
    publish: (patch: unknown) => Object.assign(state, patch),
    beginMusicQueue: () => {}, resetMusicOrder: () => {},
    pinSourceFor: () => {}, peekPinnedSource: () => null,
    rankByExplicitness: (candidates: unknown[]) => candidates, explicitnessOf: () => 0,
    musicPlaybackSourceAllowed: () => true,
    readMusicPreference: () => null, clampMusicVolume: (volume: number) => volume,
    sourcesFor: async (_track: MusicTrack, _ttl?: number, refresh?: boolean) => {
      lookups++;
      if (lookupGate) await lookupGate;
      if (exhaustedCache && !refresh)
        return [{ connectorId: "spotify", health: "healthy", track: spotify }];
      return [{ connectorId: "soundcloud", health: "healthy", track: alternative }];
    },
    invoke: async (command: string, args: { track: MusicTrack }) => {
      if (command !== "music_play_track") return;
      attempts.push(args.track);
      if (failImmediately && args.track.connectorId === "spotify") throw new Error(failure);
    },
    stopCastOwner: async () => {}, ensureNativeEvents: async () => {}, updateMediaSession: () => {},
    likedIdsFor: () => [], isMusicLiked: () => false, getMusicSpeakerState: () => ({ active: false }),
    deckAdoption: { deck: () => 0 }, require: () => ({ unhideMusicRecent: () => {} }),
  };
  const exports: { playMusic?: typeof import("../src/lib/music/player").playMusic; failLater?: (message: string) => void } = {};
  new Function(...Object.keys(scope), "exports", output)(...Object.values(scope), exports);
  return { play: exports.playMusic!, failLater: exports.failLater!, state, attempts, lookups: () => lookups };
}

test("an explicitly selected Spotify source reports immediate failure without switching providers", async () => {
  const h = fixture(true);
  await assert.rejects(h.play(spotify, [spotify], undefined, false, false, true), /Spotify unavailable/);
  assert.deepEqual(h.attempts, [spotify]);
  assert.equal(h.lookups(), 0);
  assert.equal(h.state.current?.connectorId, "spotify");
  assert.deepEqual(h.state.queue, [spotify]);
  assert.equal(h.state.phase, "error");
  assert.equal(h.state.error, "Spotify unavailable");
});

test("an explicitly selected source also stays selected when its engine fails later", async () => {
  const h = fixture();
  await h.play(spotify, [spotify], undefined, false, false, true);
  h.failLater("Spotify session ended");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.attempts, [spotify]);
  assert.equal(h.lookups(), 0);
  assert.equal(h.state.phase, "error");
  assert.equal(h.state.error, "Spotify session ended");
});

test("automatic playback still recovers and a new request clears the manual source choice", async () => {
  const h = fixture(true);
  await assert.rejects(h.play(spotify, [spotify], undefined, false, false, true));
  await h.play(spotify);
  assert.deepEqual(h.attempts.map(track => track.connectorId), ["spotify", "spotify", "soundcloud"]);
  assert.equal(h.lookups(), 1);
  assert.equal(h.state.current?.connectorId, "soundcloud");
  assert.equal(h.state.error, null);
});

test("an exhausted cached source list is refreshed before automatic playback gives up", async () => {
  const h = fixture(true, true);
  await h.play(spotify);
  assert.deepEqual(h.attempts.map(track => track.connectorId), ["spotify", "soundcloud"]);
  assert.equal(h.lookups(), 2);
  assert.equal(h.state.current?.connectorId, "soundcloud");
  assert.equal(h.state.error, null);
});

test("an unconfirmed stop never retries or switches an automatic playback source", async () => {
  const h = fixture(true, false, "STOP_UNCONFIRMED");
  await assert.rejects(h.play(spotify, [spotify]), /STOP_UNCONFIRMED/);
  assert.deepEqual(h.attempts, [spotify]);
  assert.equal(h.lookups(), 0);
  assert.equal(h.state.current?.connectorId, "spotify");
  assert.deepEqual(h.state.queue, [spotify]);
  assert.equal(h.state.phase, "error");
  assert.equal(h.state.error, "STOP_UNCONFIRMED");
});

test("a delayed recovery lookup cannot replace a newer song", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const h = fixture(false, false, "Spotify unavailable", gate);
  const newer = { ...alternative, id: "soundcloud:two", title: "Two" };
  await h.play(spotify);
  h.failLater("network stalled");
  assert.equal(h.lookups(), 1);
  await h.play(newer);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.attempts, [spotify, newer]);
  assert.equal(h.state.current?.id, newer.id);
  assert.equal(h.state.error, null);
});

test("an obsolete source lookup rejection cannot evict a refreshed candidate cache", async () => {
  const source = readFileSync(new URL("../src/lib/music/player.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("player.ts", source, ts.ScriptTarget.Latest, true);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "sourcesFor");
  assert.ok(fn);
  const declarations = `const queuedSources = new Map();
    const SOURCE_TTL_MS = 120000, SOURCE_CACHE_MAX = 16;
    export { sourcesFor };`;
  const { outputText } = ts.transpileModule(declarations + fn.getText(tree), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  let rejectOld!: (reason: Error) => void;
  const old = new Promise<never>((_, reject) => { rejectOld = reject; });
  const candidates = [{ connectorId: "soundcloud", health: "healthy", track: alternative }];
  let calls = 0;
  const exports: { sourcesFor?: (track: MusicTrack, ttl?: number, fresh?: boolean) => Promise<unknown> } = {};
  new Function("invoke", "filterMusicSourceCandidates", "compatibleVocalVersion", "exports", outputText)(
    () => ++calls === 1 ? old : Promise.resolve(candidates),
    (items: unknown[]) => items,
    () => true,
    exports,
  );
  const lookup = exports.sourcesFor!;
  const stale = lookup(spotify);
  const rejected = assert.rejects(stale, /obsolete/);
  const fresh = lookup(spotify, undefined, true);
  assert.deepEqual(await fresh, candidates);
  rejectOld(new Error("obsolete"));
  await rejected;
  assert.equal(lookup(spotify), fresh);
  assert.equal(calls, 2);
});
