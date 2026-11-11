# Ready-to-submit upstream draft pull request

**Title:** Draft: Native Refract watched-history sync (with OAuth app proposal)

**Source branch:** `G1NYU/RE-Harbor:feature/refract-sync-prototype`

**Base branch:** `Harborofficial/Harbor:beta-branch`

## What does this PR do?

Refract's Stremio addon lets users access Refract content in Harbor, but does not send Harbor's completed playback into the Refract watched-history database. This prototype provides a native Harbor → Refract path:

- `Settings → Trackers → Refract` connection panel
- Mark movies and episodes watched after Harbor's existing 85% threshold, plus manual watched actions
- Match movies and episodes using verified IMDb/TMDB/TVDB IDs
- Queue failed requests for retry; avoid repeated movie history writes
- Keep credentials in Harbor's existing secret store
- Restrict personal-key sync to Harbor's primary profile for this first version

**The complete proposal and limitations are in [docs/refract-integration-proposal.md](./refract-integration-proposal.md).**

## Refract developer app / OAuth

Refract exposes a **Register an app** flow with redirect URLs. The official [Refract Kodi client](https://github.com/refracters/refract-kodi/blob/main/service.refract/resources/lib/api.py) uses OAuth 2.0 **device authorization** rather than an auth-code redirect. A registered Harbor OAuth client with device login, `history:write` permissions and token refresh would be better than personal keys for production. If a browser-based flow is preferred, the required redirect callback must be implemented and registered exactly; the prototype deliberately does not invent a redirect URI.

## Status

**Draft: feedback requested, not ready for merge.** The committed branch has not been through a full Harbor build or end-to-end Refract API test. Personal API key Bearer support for `/v1/me` is not yet verified. Prior standalone mock tests do not prove full integration behavior. Needs typecheck, tests, Windows smoke testing, rewatch semantics and robust anime episode mapping.

No API key or account credentials are included. Refract ↔ Harbor fully bidirectional synchronization is a separate follow-up feature.

## Helpful links

- Code: https://github.com/G1NYU/RE-Harbor/tree/feature/refract-sync-prototype
- Proposal: https://github.com/G1NYU/RE-Harbor/blob/feature/refract-sync-prototype/docs/refract-integration-proposal.md
- Refract developer docs: https://getrefract.app/developers
- Refract Kodi API reference: https://github.com/refracters/refract-kodi
