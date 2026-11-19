# Experimental VK Music connector (authorized API only)

This branch adds an opt-in VK Music connection to Harbor's native connector registry. It does not use VK's private browser endpoints, copied mobile-client tokens, password harvesting, cookies, download bypasses or external service relays.

## What it can do, when VK authorizes the account
- Show VK Music in Music → Connections, with a password-style token field
- Test the provided VK-issued token using the documented `audio.search` method before saving it
- Search track metadata with explicit source attribution
- Resolve a selected recording with `audio.getById` and play the HTTPS stream URL supplied by VK
- Keep the token in Harbor's existing secret store, require HTTPS URLs, limit API request rate, never log raw credentials, and disable background search when disconnected
- Continue protecting other sources: an unavailable VK account cannot break general Music search or Harbor startup

## Blocking limitation
VK has restricted third-party audio API access since 2016. Standard VK ID/OAuth tokens generally cannot call the audio methods. An application with explicitly approved VK audio API rights is needed. A successful compilation is **not** a working-source validation. This branch must not be advertised as a functional VK streaming source without a real authorized playback test.

## Acceptance tests
1. Connected account must be approved by VK for `audio.search` and `audio.getById`
2. Search for a track; verify title, artist, owner ID and artwork
3. Play an entire track from a VK-returned HTTPS stream URL (with seek and pause)
4. Disconnect and confirm that cached stream resolution refuses further playback
5. Confirm generic Music search, Last.fm and existing connectors continue to work
6. Run native tests, TypeScript typecheck, Windows portable build and source health tests

No VK access tokens should be committed, copied into logs or sent to third-party APIs.

## Status
Research-backed experimental implementation staged 2026-11-19 for review. No real VK authorization or playback was available to verify during implementation. This feature remains **outside** `feature/harbor-upstream-functionality` and the completed VOID release.
