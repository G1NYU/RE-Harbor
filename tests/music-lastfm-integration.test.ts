import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Last.fm is updated on loaded audio and thresholded real listening", () => {
  const lastfm = readFileSync("src-tauri/src/music/lastfm.rs", "utf8");
  const events = readFileSync("src-tauri/src/music/deck_events.rs", "utf8");
  const rustTests = readFileSync("src-tauri/src/music/engine_tests.rs", "utf8");
  assert.match(lastfm, /"track\.updateNowPlaying"/);
  assert.match(lastfm, /"track\.scrobble"/);
  assert.doesNotMatch(lastfm, /"chosenByUser"\.to_string\(\), "1"/);
  assert.match(events, /update_now_playing\(&now_app, &now_track\)\.await/);
  assert.match(events, /if !scrobble_started && should_scrobble\(listened_seconds, duration_seconds\)/);
  assert.match(events, /scrobble_started = true/);
  assert.match(events, /duration_seconds <= 30\.0/);
  assert.match(rustTests, /should_scrobble\(22\.5, 45\.0\)/);
  assert.match(events, /listened_increment\(previous_position, \*position\)/);
});
