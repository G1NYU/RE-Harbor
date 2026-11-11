# 8SPINE compatibility for Harbor

**Status: feasibility / compatibility probe. This branch does not yet provide playable 8SPINE music sources.**

## What was confirmed on 11 November 2026

Harbor has a Rust MusicConnector trait with search, resolve, and optional catalog methods, a ConnectorRegistry, and a subprocess worker in src-tauri/src/music/worker.rs. Its present worker executes declarative, permission-checked HTTP operations, **not third-party JavaScript**.

8SPINE documents JavaScript modules with searchTracks(query, limit) and getTrackStreamUrl(id, quality). Repository indexes group modules under the literal category:modules key; download fields point to executable modules, not music search API endpoints.

| Repository index | Observation |
| --- | --- |
| https://jimmy-iota.vercel.app/index.json | Available; advertises a plain JavaScript module |
| https://raw.githubusercontent.com/a1xh1m5/reverb-spine/refs/heads/main/index.json | Available; Reverb package begins with the opaque 8SM1. prefix |
| https://8spine-modules.vercel.app/index.json | HTTP 404 at inspection |
| https://kinetic.xander12.workers.dev/index.json | Reports upstream index HTTP 404 at inspection |

These statuses may change. The supplied Mornye Roaming project provides an interesting parallel example of an extensible desktop client, but its own extension format does not establish interoperability with 8SPINE modules.

## How to run this stage

From the root of the fork:

    node tools/8spine-probe.mjs
    node tools/8spine-probe.mjs --json
    node tools/8spine-probe.mjs --index=https://example.org/index.json
    node --test tests/8spine-probe.test.mjs

The probe checks index format, relative download resolution, HTTP failures, HTTPS URL policy, size limits, and superficial package signatures. It never executes downloaded code. The label "javascript-candidate" does not mean the module runs in Harbor. An index with an error causes a nonzero CLI exit code.

## Integration roadmap

1. Add an explicitly opt-in module repository manager and per-module enable/disable and removal. Show source, publisher, version, download URL, package format and effective permissions. Never auto-install all advertised modules.
2. Add a **separate sandboxed JavaScript runtime** for plain JS modules, ideally using a restricted worker subprocess. Do not eval third-party JavaScript in Harbor's privileged Tauri WebView. No local filesystem, shell, Tauri IPC, environment, or secret access. Restrict outbound hosts, response sizes, runtime, memory, redirects and storage.
3. Implement a Rust MusicConnector adapter: 8SPINE searchTracks -> Harbor MusicTrack results; getTrackStreamUrl -> MusicStream for Harbor/libmpv. Qualify track IDs with both module and track IDs. Forward quality selection and handle expiring URLs and required headers.
4. Reuse Harbor's source-consent gate, health reports, source matching, caching and error handling; test that disabling a module immediately prevents further requests.
5. Add integration fixtures for successful search and playback, invalid payloads, network errors, timeouts, module updates, stream expiration and offline state. Confirm actual libmpv playback on a development build before claiming a working connector.

## Known blocker: packed modules

Reverb's downloaded content begins with "8SM1.", not JavaScript. The publicly linked 8SPINE API reference does not define that package format or its unpacking procedure. Do not treat it as executable JS. Supporting such packages requires a documented, legitimate loader/format from 8SPINE or the module author.

Reference links:
- https://8spine.club/documentation#api-reference
- https://github.com/Harborofficial/Harbor/tree/beta-branch/src-tauri/src/music
- https://github.com/Harborofficial/Harbor/blob/beta-branch/src-tauri/src/music/worker.rs
