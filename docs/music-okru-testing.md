# Testing the experimental OK.ru connector on Windows

This connector is intentionally isolated on `feature/music-okru-experiment`.
CI verifies compilation and fixture parsing, not current live OK.ru access.

## Enable

1. Use a Windows build of this experiment branch, not the standard Harbor release.
2. Close Harbor completely before starting the test.
3. In PowerShell, run:
   ```powershell
   $env:HARBOR_EXPERIMENTAL_OKRU = "1"
   & "C:\path\to\harbor.exe"
   ```
   Replace the placeholder with the executable location. The environment variable
   only affects the Harbor process started from that PowerShell window.
4. In **Music → Connections**, open **OK.ru (Experimental)**. Enter the
   `JSESSIONID` from **your own signed-in OK.ru account**, obtained locally.
   Never share it in chat, GitHub logs, issues, or screenshots.
5. Connecting now probes OK.ru search with that session. If the endpoint rejects
   the session or returns an incompatible response, the form shows an error and
   a previously working session is not replaced.
6. If connected, search with OK.ru as the selected source, then play a
   recording you can access in your account. Note the displayed error message
   on failure, but **never copy the session or signed audio URL** into reports.
7. Disconnect to clear the in-memory session. Restart Harbor to disable it
   (unless you provide the opt-in flag again).

## What results mean

- **Login / session error:** session expired or the historic API no longer
  recognizes browser session credentials.
- **Search response format changed:** API behavior differs from older fixtures.
- **Track search works, playback fails:** the playback endpoint or signed
  audio URL may require additional authorization not implemented here.
- **Successful playback:** only verifies that particular account/track.
  We still need repeatability checks, failures, and stream recovery tests.

The experiment doesn't store sessions on disk and doesn't attempt to bypass
account restrictions or audio protection. The optional source is not included
in the stable Music Reliability branch.
