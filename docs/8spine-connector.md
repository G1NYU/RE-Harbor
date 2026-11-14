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

## Simulated network broker — next validation stage

The first native-engine suite passed on Windows and Linux (run 43580907454). This stage adds a deliberately simulated JSON request/response broker and a minimal fetch-shaped JavaScript shim, available only to the compiled-in broker fixture. There are no sockets, DNS queries, external HTTP requests, or credentials. The approved HTTPS fixture hostname and paths are hard-coded; the worker does not accept arbitrary code or grants from the input. GET only, no custom headers, no redirects, no credentials in URLs, 8 requests per invocation (including denied calls), 4 KiB request envelope, 32 KiB response cap, and the existing engine deadline. Tests cover allowed requests, search/resolve, HTTP errors, private/metadata IPs, hostname lookalikes, redirects, limits, and hidden raw bridge.

A real transport is intentionally not wired yet. Before enabling one, obtain explicit module/version-specific user consent, enforce DNS and IP policy against private/link-local/loopback addresses including IPv6 and rebinding, pin validated destinations through connection establishment, disable proxies and redirects, bound time and streaming bytes, and isolate the worker at the OS level. Do not interpret this mock as proof of real HTTP, third-party module execution, or playable streams. The native fixture CI will validate this stage independently on Windows and Linux.

## Host-only HTTPS transport prototype

Run 43627010202 passed the simulated broker on Windows and Linux. The next stage adds a separate Rust HTTP transport using reqwest 0.12.28. It is **not** connected to the JS callback or worker stdin. A trusted host must create a module/version-specific grant, authorize each GET before resolving its destination, supply an independently resolved matching hostname and vetted public IPv4 addresses, then consume the single-use request. Requests are limited to exact approved HTTPS DNS names and port 443. The client pins the checked addresses, retains normal TLS certificate/hostname verification, disables redirects and proxies, and caps response bytes and total request time. Nonpublic/special IPv4 ranges and all IPv6 are rejected in this conservative prototype. No user-controlled headers, cookies, bodies or credentials are accepted. Unit tests use synthetic DNS answers, response chunks and client construction without external requests. Grant persistence, revocation, bounded DNS resolution, OS-level confinement, real provider traffic and playback remain unimplemented. This is not a claim of production SSRF resistance or compatibility with downloaded modules.

## Harbor-shaped fixture adapter

Run 43629416736 passed the host-only HTTPS transport tests on both operating systems. The standalone crate now also provides a fixture-only adapter with typed JSON shaped like the actual MusicTrack and MusicStream structs in src-tauri/src/music.rs. It calls the embedded QuickJS runtime for search and resolution, distinguishes numeric and string source identifiers, qualifies track IDs by the compiled-in fixture, validates bounded metadata and exact resolved identity/quality, suppresses unchecked artwork and returns only the non-routable fixture URL. It never returns credentials, arbitrary headers, or a playable external URL. Unknown duration is rejected rather than guessed; fixture MIME type and bitrate describe only the synthetic fixture descriptor (bitrate 0 means unknown). The adapter is not registered with Harbor, is not a real playback implementation, and has no downloaded-module loader. Tests cover schema serialization, cross-source substitution, mismatched IDs, malformed results, quality, and search-to-resolve. The next integration stage must use Harbor's actual MusicConnector and source-consent gate, and keep the non-routable test fixture disabled by default. Real modules require the separate supervised runtime and approved transport integration.

## Actual Harbor connector contract (test-only)

The adapter suite passed on Windows and Linux in run 43630350489. A new explicit fixture-worker CLI mode sends Harbor-shaped JSON over stdin/stdout. A test-only module in the actual Tauri music crate implements MusicConnector, registers only in an isolated test registry, runs the compiled fixture worker with a cleared environment and bounded IPC, deserializes the real MusicTrack schema and checks a resolved MusicStream descriptor. Its playback capability is deliberately false and its trait resolve method refuses to return a URL for playback. No production registration, external module loading, persistent consent storage, or network access is enabled. The dedicated Linux integration job builds the standalone worker and runs the ignored native contract test explicitly using an absolute trusted executable path. Normal Harbor builds do not compile this test connector. Windows and Linux still run standalone worker tests; full Tauri integration is initially Linux-only.

## Host-owned module catalog and consent

Run 43630832773 passed all three jobs, including the actual Harbor test registry and bounded worker IPC. The next development component is an in-memory, host-owned module manager. It ingests bounded repository index bytes without downloading packages or following external sources. Only recognized music category MODULE records are catalogued, and conflicting same-repository module IDs fail closed. A repository URL plus module ID scopes the identity. Installation stages explicitly supplied bytes, creates a SHA-256 fingerprint, and starts disabled. JavaScript candidate classification is not validation or permission to execute; opaque/unknown and access-only entries cannot be staged for execution. The manager does not store executable bytes or implement a loader. Host-approved exact domains are bound to the staged fingerprint; changed versions, URLs or bytes require a fresh approval. Disable/remove revoke future grants, and a generation-bound permit can be checked against the manager before a later host operation. No running network tasks are cancelled by this prototype. Persisted state, trusted package retrieval, resolver/sandbox integration, signed package provenance, real playback, and UI remain separate work. Tests exercise repository collisions, malformed manifests, staging, explicit consent, updates, revocation, and unsupported packages. No live third-party modules are executed.
