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

## Repository update — 14 November 2026

The user supplied https://8spine-modules.pages.dev/ as the current module library; its /index.json and /documentation/ were accessible during inspection. The flattened index includes category:modules and other publisher-specific categories alongside an external_sources list. The probe now defaults to this index, reads all published music categories without following external indexes or downloading executable packages, and skips artwork/access-only records. The repository's listing is not proof that a module is playable or authorized. Individual package retrieval was not verified.

A reference contract adapter (tools/8spine-fixture-contract.mjs) exercises the documented search and resolution methods using only locally authored fixture objects and a non-routable example.invalid URL. It is intentionally not a loader, sandbox, production adapter, or playback test. Packed modules remain unsupported.

## How to run this stage

From the root of the fork:

    node tools/8spine-probe.mjs
    node tools/8spine-probe.mjs --json
    node tools/8spine-probe.mjs --inspect-packages # optional format-only inspection
    node --test tests/8spine-fixture-contract.test.mjs
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

## Development runtime proof of concept

Run with Node.js 22.13+:

    node --test tests/8spine-runtime.test.mjs

The fixture-only runtime uses a fresh subprocess per request, JSON input/output, an allowlisted locally authored JavaScript fixture, a VM execution deadline, a parent-process wall deadline, bounded output, a V8 old-generation heap limit, a reduced child environment and Node's permission model. The fixture context has no fetch, process, require, timers, console bridge or dynamic code generation. No module file, credential, or arbitrary source code is accepted; the resolved fixture URL is deliberately non-routable. No real media is retrieved.

The five runtime tests passed locally under Node 22.16.0 on Linux. Windows and actual Harbor playback remain untested. Node vm is not a security boundary for untrusted JavaScript, the heap cap is not a process-wide memory limit, and Node's permission model is not network isolation. This is development scaffolding, not the production module loader.

Next: design a constrained embedded JS engine in Harbor's existing native worker architecture, with a separately audited, consent-gated network interface and process-level isolation. Keep it disabled for downloaded code until those boundaries are enforced and verified. Packed modules need documented format support; do not unpack them by guessing.

## Native embedded-engine fixture

The standalone crate at `tools/8spine-native-poc` evaluates only compiled-in fixtures with rquickjs 0.14.0 (QuickJS), using the minimal std feature rather than dynamic/native module loading. It accepts one bounded JSON request on stdin and writes one JSON reply. The engine has a 16 MiB heap budget, 256 KiB stack limit, 350 ms interrupt deadline, and a 256 KiB serialized-result cap. The fixture's output URL is deliberately non-routable.

Run `cargo test --manifest-path tools/8spine-native-poc/Cargo.toml`. The dedicated fork workflow builds and tests on Windows and Linux, independently of Harbor's full Tauri build. Initial verification is pending; the local coding environment does not provide Cargo.

This is a native development prototype, not a production sandbox or a registered Harbor connector. It has no HTTP bridge, OS-level confinement, downloaded code execution, or real playback. For production: audit and lock dependencies; place the engine inside an externally supervised, OS-constrained worker; introduce an explicit consent-gated broker; validate result identities and authorized stream URLs; then register the adapter through Harbor's MusicConnector interface. The opaque package format is still unsupported.

Engine API: https://docs.rs/rquickjs/0.14.0/rquickjs/
