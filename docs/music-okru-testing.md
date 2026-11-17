# Experimental OK.ru Windows smoke test

This script uses the user's own authenticated session, without saving or printing session identifiers or signed music links.

1. Download scripts/music-okru-smoke.ps1 from the experimental branch.
2. In Windows PowerShell, navigate to the download directory.
3. Run: powershell -NoProfile -ExecutionPolicy Bypass -File .\music-okru-smoke.ps1
4. Enter the JSESSIONID from your own signed-in browser session, locally and privately. Never upload or paste it into chat, issues, or logs.
5. The test reports authentication/search, playback metadata and one ranged HTTP audio response. It inspects only response headers (not the audio body).
6. A failure may mean the historical OK.ru API changed, access is restricted, or the audio link requires additional authorization. This experiment does not bypass restrictions.

For Harbor itself, set HARBOR_EXPERIMENTAL_OKRU=1 before launching a build from feature/music-okru-experiment. Then use Music > Connections to enter the same session. A live search probe validates it before setting connection state.
