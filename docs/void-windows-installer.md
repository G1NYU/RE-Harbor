# Harbor VOID + Refract — Windows installer

This installer repackages the **already tested** Windows VOID + Refract application,
without changing Music, VOID visuals, or Refract runtime source.

- Source baseline: `feature/void-refract-2026-11-preview` at `bd7e87222dd2`.
- Installer branch: `feature/void-refract-installer`.
- Windows setup artifact: `harbor-void-refract-windows-installer-x64`,
  containing `Harbor-VOID-Refract-Setup-x64.exe`.
- Setup type: Tauri v2 NSIS, per-user installation, Start-menu shortcut and
  standard Windows uninstall registration.
- Identity: `app.harbor.voidnativepreview`, shared with the tested portable VOID
  preview so app-scoped data remains compatible; **not** the stock Harbor
  identity (`app.harbor`).
- Video file associations are disabled, stock `harbor`/`stremio` deep links are
  not claimed, and independent builds do not connect to Harbor's upstream
  automatic updater.
- Source packaging: the same Windows sidecars (mpv, libmpv, ffmpeg, ffprobe,
  yt-dlp) and fonts as the portable build. Extension and Pokemon engines are
  still intentionally omitted, as in the portable preview.
- No release is published, no official installer modified, and no secret
  signing keys are accessed. Installer is unsigned and may trigger SmartScreen.

## Validation

1. `node --test tests/void-windows-installer.test.mjs`: configuration
   isolation, updater safety, retained dependencies and workflow structure.
2. The Windows GitHub Actions job builds a real NSIS setup, checks inputs,
   verifies a nonempty executable and records its SHA-256.
3. On an ephemeral Windows runner, silent-install; check separate HKCU
   uninstall registration, program executable and Start-menu shortcut;
   silent-uninstall.
4. Only after all steps pass, upload the setup artifact.

## User installation

Download the green GitHub Actions artifact, extract the ZIP, run
`Harbor-VOID-Refract-Setup-x64.exe`, and launch Harbor VOID from Windows Start.
Use Windows Settings → Apps → Installed apps to uninstall.

Preserve a backup of important user data before replacing the portable build;
the installer does not itself migrate or remove a portable folder. Installing
does not automatically update any existing system-level Harbor instance.
