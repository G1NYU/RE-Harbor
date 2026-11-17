# Experimental OK.ru Windows smoke test

This script uses the user's own authenticated session, without saving or printing session identifiers or signed music links.

1. Download scripts/music-okru-smoke.ps1 from the experimental branch.
2. In Windows PowerShell, navigate to the download directory.
3. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\music-okru-smoke.ps1
4. Enter the JSESSIONID from your own signed-in browser session, locally and privately. Never upload or paste it into chat, issues, or logs.
5. The test reports authentication/search, playback metadata and one ranged HTTP audio response. It inspects only response headers (not the audio body).
6. A failure may mean the historical OK.ru API changed, access is restricted, or the audio link requires additional authorization. This experiment does not bypass restrictions.

For Harbor itself, set HARBOR_EXPERIMENTAL_OKRU=1 before launching a build from feature/music-okru-experiment. Then use Music > Connections to enter the same session. A live search probe validates it before setting connection state.


## Auth failure diagnostics

If you get `error.notloggedin`, the original URL session has been rejected.
The local smoke test now tries a second, standard Cookie-header session request.
If **both** are rejected, stop re-copying the same cookie; it does not establish
that the website cookie is valid for the historical WMF API.

For a safe next investigation, open your own OK.ru Music page in Firefox,
play a track and use **F12 > Network** to inspect **request domains and route
names only** (not full URLs, cookies, query strings or bodies). Report only
whether the browser uses `wmf.ok.ru` or a different music endpoint. This
helps determine whether the connector needs a new authentication flow.

A November 2026 experimental Python SDK reports using `curl_cffi` for a
browser-like HTTP stack, so transport behavior may also differ from plain
PowerShell. Do not install unverified packages or share credentials to test it.


## Nov 2026 WMF request refresh

A published Nov 2026 third-party SDK uses GET /queryMixedSuggestions with client=web&locale=ru and browser-style headers. The earlier local probe used legacy GET /tracks, which might not be a valid current endpoint. The fallback Cookie-only /tracks probe gave HTTP 404, so it was not a valid session test.

Run scripts/music-okru-modern-probe.ps1 in Windows PowerShell 5.1. It only prints HTTP status and JSON field names, never the session, playback URL or track data. The optional -TrackId N argument makes a POST /play metadata request for a track your account is allowed to access. No download is attempted. Even if this passes, the Rust connector still uses the old endpoint, and must be updated after confirming the returned search shape.
