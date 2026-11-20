# Harbor VOID installer

This installer packages the **exact working Windows x64 portable artifact** created
by GitHub Actions run 44737578800, based on application commit `57b3285`.
Later commit `bd7e872` changes only tests (no production application code).

It does not rebuild or modify `harbor.exe`, media sidecars, UI, Refract, music,
or settings. The NSIS installer places these original files in
`%LOCALAPPDATA%\\Programs\\Harbor VOID`, registers a per-user uninstall entry,
and adds distinct Start Menu/Desktop shortcuts. It does **not** overwrite the
official Harbor app, change video associations, configure official updates,
or remove profile data on uninstall. The application continues using the
tested isolated Tauri identifier `app.harbor.voidnativepreview`.

Build: push `installer/void/void-preview.nsi` or the dedicated workflow on
`feature/void-refract-2026-11-installer`.
GitHub Actions downloads the verified portable artifact, builds a standalone
installer executable using NSIS, and runs an install/uninstall test on an
ephemeral Windows machine, comparing the original and installed SHA-256 hashes
of the app and each media sidecar.

The installer is unsigned; Windows SmartScreen may show a publisher warning.
No production release or deployment is triggered. This does not add
automatic updates, plugin runtime support or the optional Pokemon engine:
the contents exactly match the tested portable build.
