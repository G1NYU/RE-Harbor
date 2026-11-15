# 8SPINE compatibility for Harbor

**Status: feasibility / compatibility probe. This branch does not yet provide playable 8SPINE music sources.**

## What was confirmed on 11 November 2026

Harbor has a Rust MusicConnector trait with search, resolve, and optional catalog methods, a ConnectorRegistry, and a subprocess worker in src-tauri/src/music/worker.rs. Its present worker executes declarative, permission-checked HTTP operations, **not third-party JavaScript**.

8SPINE documents JavaScript modules with searchTracks(query, limit) and getTrackStreamUrl(id, quality). Repository indexes group modules under the literal category:modules key; download fields point to executable modules, not music search API endpoints.

| Repository index                                                                  | Observation                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| https://jimmy-iota.vercel.app/index.json                                          | Available; advertises a plain JavaScript module               |
| https://raw.githubusercontent.com/a1xh1m5/reverb-spine/refs/heads/main/index.json | Available; Reverb package begins with the opaque 8SM1. prefix |
| https://8spine-modules.vercel.app/index.json                                      | HTTP 404 at inspection                                        |
| https://kinetic.xander12.workers.dev/index.json                                   | Reports upstream index HTTP 404 at inspection                 |

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

## Persistent music module metadata (development-only)

The rebased validation run 43663784431 passed the Windows and Linux standalone suites, the actual Harbor fixture connector integration, and the full frontend suite. Harbor’s full native suite had one unrelated seeding fixture failure (1,487 passed, 74 ignored); the failing test and seeding files are unchanged from upstream. The music-only module manager now accepts repository homepages and index URLs, remembers repository and staged-package metadata in a bounded versioned JSON snapshot, and atomically replaces the snapshot in a trusted host-owned directory. The snapshot excludes executable bytes, network grants and enabled state. Restarted modules must be restaged with actual bytes and explicitly approved; permits cannot cross manager instances. Removal revokes the repository’s module permits. Tests cover round-trip, corruption, symlinks, limits and revocation. The snapshot is not a security boundary against a local writer and no downloaded code, package download, live playback, production UI or sandbox is enabled. A single host writer is required; the application must eventually serialize state updates and surface write errors to the user.

## Supervised, fixture-only worker and Linux namespace experiment

Run 43669626116 passed 27 standalone Rust tests on each operating system, 15 focused JavaScript tests, the Harbor connector IPC test and 8,322 full frontend tests (one skipped). The unchanged Harbor seeding fixture still fails the full native regression (1,487 passed). CI now reports the full native regression independently without skipping, retry-masking or allowing its failures. The cross-platform supervisor bounds stdin and stdout, separates trusted worker launch from fixture requests, clears ambient environment, uses a private working directory, and enforces a parent-side deadline. The experimental Linux path additionally requires Bubblewrap, separates user, mount, PID, IPC and network namespaces, disables nested user namespaces, and exposes the trusted worker, system library directories and private temporary storage only. It never falls back to an unsandboxed execution path when isolation fails. A dedicated Linux check tests an actual synthetic host file and loopback listener, then runs the compiled-in catalog fixture inside the sandbox. Windows tests exercise the supervisor but do not establish an OS-level security boundary. Downloaded scripts are still rejected on all platforms. This experiment does not establish production confinement against a native engine exploit; packaging, explicit syscall and resource policies, Windows AppContainer or equivalent confinement, package format support, approved network mediation and playback remain open. No live services are used by these tests.

## Linux isolation startup diagnostics

Run 43671727472 passed Windows and Linux supervision (31 tests each), the real Harbor fixture connector, and all 8,322 non-skipped frontend tests. The independent native regression still has the unchanged seeding failure. The Linux namespace check exited before returning its diagnostic result; the previous supervisor suppressed stderr, so the exact startup cause was not established. Ubuntu 24.04's AppArmor user-namespace restrictions are a plausible cause. The dedicated CI job now reproduces the exact Bubblewrap arguments with a compiled-in fixture, reports launcher stderr, and only on a matching permissions failure with the expected active restriction attempts to load Ubuntu's packaged bwrap-userns-restrict profile. It refuses to replace an already active Bubblewrap profile, does not disable AppArmor or the host-wide user-namespace setting, and does not grant the worker extra privileges or share the host network. The original filesystem and loopback denial assertions remain mandatory. Profile provisioning is limited to the disposable CI runner; it is not an installation procedure for user machines. Until the actual isolation test passes, Linux isolation remains unvalidated. Windows OS confinement and downloaded module execution are still disabled.

## Windows AppContainer fixture experiment

Run 43673780434 passed the real Linux namespace denial test after provisioning Ubuntu's scoped distro profile, as well as both standalone suites, the actual music connector and the full frontend suite. The independent Harbor native seeding fixture is still the only general regression failure. The new Windows-only C++ harness exercises a regular AppContainer with zero explicitly granted capabilities and a fresh OS-generated profile. It copies the trusted compiled worker into a test-owned directory, grants the profile read/execute on that directory and executable only, and launches the worker suspended with an explicit stdin/stdout handle list and minimal environment. The parent checks the actual child token and profile SID, assigns a single-process, memory-limited, kill-on-close Job Object and resumes only after those checks succeed. Output is bounded and wall-clock deadlines are enforced; every failure terminates the worker without fallback. The PowerShell driver owns a synthetic host sentinel and loopback listener, verifies baseline access and requires a successful confined music search plus actual denial of host file and network access. This is a dedicated Windows CI harness and has not yet been validated; it is not integrated into the production Rust supervisor, not LPAC, and does not establish complete production confinement. It uses no real music providers, no downloaded scripts and no playback. Test-owned artifacts and the temporary AppContainer profile are cleaned up after the run.

## Windows launch environment compatibility

Run 43676177659 compiled the Windows harness but CreateProcessW failed with error 203 (ERROR_ENVVAR_NOT_FOUND). The remaining five integration-related jobs passed, including Linux namespace isolation. Microsoft documents AppContainer profile selection and redirection through LOCALAPPDATA (https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer). The fixture launcher now includes the host's LOCALAPPDATA as an explicit profile-resolution input alongside SystemRoot in the minimal Unicode environment block. It rejects a missing or invalid path and still excludes PATH and inherited runner variables. This is a targeted hypothesis, not confirmation that the error is resolved. All token, handle, job, filesystem and loopback assertions remain mandatory; there is no fallback to unrestricted execution. No third-party packages run.

## Windows private desktop startup experiment

Run 43692958520 advanced past CreateProcessW error 203: the process was created, its token verified and the job assigned, but the worker exited with 0xC0000142 (STATUS_DLL_INIT_FAILED). All five previously green dedicated jobs remained green. Similar noninteractive session failures are documented in microsoft/mxc issue 1465; the runner session and dependency table will now be logged to test this hypothesis. The harness creates a unique noninteractive window station and private desktop, using explicit DACLs for the parent, SYSTEM, restricted code and the unique test AppContainer SID, with a Low mandatory integrity label. It restores the caller's station before launch, passes the private desktop by name and never alters the caller's desktop ACL, grants network capabilities or falls back to unrestricted execution. The profile, desktop and window station are test-owned and disposable. The original filesystem and loopback assertions are unchanged; successful Windows confinement is not yet established. Production integration and downloaded modules remain disabled.
