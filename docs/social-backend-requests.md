# Harbor Social API — what the client needs from the backend

This is a request written from the client side. Everything under **Today** was verified against
`https://harborcommunity.site/themes/api/social` from the shipping app; everything under
**Proposed** is what the front end needs in order to stop working around missing routes.

The client already calls some of the missing routes on purpose (for example
`GET /social/users/search`), so a route landing later switches the feature on without a UI rewrite.

---

## 1. Vocabulary, for whoever is reading this first

- **Backend**: the server and database that own the accounts, ratings, reviews, comments and
  friendships. It is the only copy that is authoritative. The desktop app (the _frontend_) has no
  database of its own beyond a local cache.
- **API / endpoint**: a URL the app is allowed to call, e.g.
  `GET /themes/api/social/u/{handle}/ratings`. Each endpoint has a request shape and a response
  shape. When the app calls a route that does not exist, the server answers `404 not_found` and the
  feature either degrades or has to be assembled client-side from other routes.
- **Why this matters for the product**: a route that does not exist cannot be invented by the app.
  The app can only rearrange what it can read. For example, "reviews for this movie" is currently
  impossible to ask for directly, so the app walks every friend's public rating history and filters
  locally. That is slow, incomplete and capped. A single route replaces all of it.

Conventions the current API already follows and new routes should keep:

- Base: `https://harborcommunity.site/themes/api/social`
- Auth: `Authorization: Bearer <token>`; unauthenticated on a protected route → `401 {"error":"auth_required"}`
- Unknown route → `404 {"error":"not_found"}`
- JSON in and out, camelCase fields, ISO-8601 timestamps, `itemKey` strings are opaque and must be
  echoed back unchanged (`tmdb:movie:809`, `mal:42310`, `tt0111161`).
- List pages: `{ items | users | comments, nextCursor?: string, total?: number }`, 20–50 per page.
- Mutations return the updated row, not just `{ ok: true }`, so the client can reconcile.

---

## 2. Today: what already exists (do not break these)

Verified working:

| Route                                                                                                                                       | Notes                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /social/u/{handle}`                                                                                                                    | public profile                                               |
| `GET /social/u/{handle}/friends`                                                                                                            | accepted friends                                             |
| `GET /social/u/{handle}/ratings?type=&cursor=`                                                                                              | 20 per page, includes `review`, `spoiler`, `at`, `createdAt` |
| `GET /social/u/{handle}/badges`                                                                                                             |                                                              |
| `GET /social/u/{handle}/activity?limit=`                                                                                                    |                                                              |
| `GET /social/u/{handle}/comments` (+ `POST`, `DELETE /{id}`, `POST                                                                          | DELETE /{id}/like`)                                          | comments live on a **profile**                                                  |
| `GET /social/friends`, `/friends/pending`, `POST /friends/request`, `POST /friends/{edge}/accept                                            | decline`, `POST /friends/remove`                             |                                                                                 |
| `POST /social/ratings`, `POST /social/ratings/delete`, `/social/ratings/me`, `/social/ratings/bulk`                                         | rating upsert/delete/import                                  |
| `GET /social/groups/discover`, `GET /social/groups/{id}`, `/groups/{id}/join                                                                | leave                                                        | posts`, `/groups/mine`, `/groups/invites`, `/groups/{id}/members/{userId}/role` |     |
| `GET /social/me/feed`, `/social/me/watching`, `/social/me/notifications`, `POST /me/notifications/read`, `PATCH /me/profile`, `/u/me/stats` |                                                              |
| `GET /social/presence` (per profile fields `online`, `presence`)                                                                            |                                                              |

Verified **missing** (404/405 today): `/social/users`, `/social/users/search`, every per-title
review route, every star/like route on a rating, and any comment route keyed to a rating.

---

## 2b. Shipped since this document was written

These routes now exist and are called by the app. Everything here is authoritative over the
"missing" list in section 2 and over any Priority 1 item it contradicts.

| Route                                                           | Used for                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /social/users?q=&sort=&limit=&cursor=&rated=1&canvas=1`    | user directory and search. `sort`: `newest` (default), `oldest`, `username`, `relevance`. `rated`/`canvas` filter and combine. Each row carries `ratingCount` and `hasCanvas` |
| `GET /social/u/{handle}/quick?sort=&cursor=&limit=`             | profile card + first page of that author's reviews in one round trip                                                                                                          |
| `GET /social/u/{handle}/reviews`                                | reviews authored by one person, author-scoped, paginated                                                                                                                      |
| `POST                                                           | DELETE /social/reviews/{id}/reaction`                                                                                                                                         | stars on a review; response carries the authoritative count |
| `GET /social/dm/conversations`, `POST /social/dm/conversations` | DM inbox and starting a conversation                                                                                                                                          |
| `GET                                                            | POST /social/dm/conversations/{id}/messages`                                                                                                                                  | thread history and sending                                  |
| `POST /social/dm/conversations/{id}/read                        | mute                                                                                                                                                                          | hide`                                                       | read state, mute, hide-for-me |
| `PATCH                                                          | DELETE /social/dm/messages/{id}`                                                                                                                                              | edit and delete an own message                              |
| `PUT                                                            | DELETE /social/dm/messages/{id}/reaction`                                                                                                                                     | reactions on a message                                      |
| `GET /social/parties/room/{code}/invites`                       | pending/recent invitations for a room                                                                                                                                         |
| `POST /social/parties/invites`                                  | invite people to a watch party; skips blocked, banned, unknown and already-invited recipients                                                                                 |
| `POST /social/parties/invites/{id}/accept                       | decline`, `DELETE /social/parties/invites/{id}`                                                                                                                               | respond to, or revoke, an invitation                        |
| `PATCH /social/me/profile` (card fields)                        | `profileCard` appearance: validated and returned with every profile                                                                                                           |
| `GET /social/feed`                                              | derived activity feed, including "`{user}` joined `{group}`" rows                                                                                                             |

Deliberately **not** built: per-title review routes. A title's reviews are assembled from
`/social/u/{handle}/ratings` and `/social/u/{handle}/reviews`, and posters use the batch summary
route instead of one call per card.

---

## 3. Priority 1 — required for social reviews to be 100% functional

### P1-1 A stable review identity

`GET /social/u/{handle}/ratings` returns rows identified only by `itemKey` + `mediaType`. There is
no `id`. Stars, comments, reporting and deep links all need a stable id, and a review must survive
the rater editing it (same id, updated text, `edited: true`).

Add to every rating row, everywhere it is returned:

```json
{
  "id": "rv_7f3c1a...",
  "itemKey": "tmdb:movie:809",
  "mediaType": "movie",
  "handle": "msg",
  "alias": "Mohammed",
  "avatarUrl": "https://…",
  "verified": true,
  "score": 7.5,
  "review": "…",
  "spoiler": false,
  "stars": 12,
  "starred": false,
  "comments": 4,
  "at": "2026-10-26T08:13:35.778Z",
  "createdAt": "2026-10-22T11:37:38.936Z",
  "editedAt": null
}
```

`id` must be stable per (user, itemKey, mediaType) or regenerated only on delete + recreate.
`starred` is relative to the calling user (absent/false for anonymous).

### P1-2 Reviews for one title — the core missing route

Today the client assembles this from N rating histories. It needs one call:

```
GET /social/reviews?itemKey=tmdb:movie:809&mediaType=movie
    &scope=friends|everyone
    &sort=newest|stars|comments
    &cursor=...&limit=20
```

- `scope=friends`: reviews from the caller's accepted friends (`401` if anonymous).
- `scope=everyone`: all public reviews for that title, viewers excluded as the client prefers or
  included with `mine: true` (the client already filters self out).
- `sort=stars` / `sort=comments` must order by the real counters, tie-break by `at DESC`.
- Response: `{ "items": [Review], "nextCursor": "...", "total": 128, "counts": { "ratings": 240, "reviews": 128, "avg": 7.4, "stars": 310, "comments": 44 } }`
- Identity rule: a row belongs to exactly one `(itemKey, mediaType)` pair. A movie id must never
  answer for an anime with the same id.

Also useful, same shape:

```
GET /social/me/reviews?cursor=...                 // the caller's own reviews
GET /social/me/reviews/feed?cursor=...            // friends' recent reviews, for home shelves
```

### P1-3 Stars (reactions on a review)

Stars do not exist at all today; every plausible route answers 404. The app currently shows no star
button rather than a dead one, and sorts by score/date instead of popularity.

```
POST   /social/reviews/{id}/stars        → 200 { "stars": 13, "starred": true }
DELETE /social/reviews/{id}/stars        → 200 { "stars": 12, "starred": false }
GET    /social/reviews/{id}/stars        → 200 { "stars": 12, "starred": false }
```

Rules that matter to the UI:

- Unique per `(reviewId, userId)`; a second `POST` is idempotent, not a duplicate.
- Starring **must not touch the reviewer's score or the title's average**.
- Return the authoritative count in the same response so the client never estimates.
- Batch read for lists: `GET /social/reviews/stars?ids=a,b,c` → `{ "a": {stars, starred}, … }`.

### P1-4 Comments attached to a review

Profile comments exist, but a comment "on a review" does not. The client currently maps a reply to a
comment on the reviewer's profile that quotes the title — workable, but it is a profile comment,
not a review comment, and counts require one request per reviewer.

```
GET    /social/reviews/{id}/comments?cursor=&limit=   → { "items": [Comment], "nextCursor": "...", "total": 9 }
POST   /social/reviews/{id}/comments                  → 201 Comment   body: { "body": "…", "parentId": "…"? }
PATCH  /social/reviews/{id}/comments/{commentId}      → 200 Comment   body: { "body": "…" }
DELETE /social/reviews/{id}/comments/{commentId}      → 204
POST   /social/reviews/{id}/comments/{commentId}/like → { "liked": true, "likeCount": 3 }
DELETE /social/reviews/{id}/comments/{commentId}/like → { "liked": false, "likeCount": 2 }
```

`Comment` should be the same object the profile comments already return (`id`, `parentId`,
`authorHandle`, `authorAlias`, `authorAvatarUrl`, `authorVerified`, `body`, `at`, `edited`,
`likeCount`, `liked`, `flagged`). Reply-depth limit of 1 keeps the UI honest. Deleting a review or a
rating must remove its comments, or mark them orphaned in the same way profile comments are.

### P1-5 Batch lookups — kill the N+1

The client currently scans up to 48 friends and 40 community profiles, 3 pages each, with four
requests in flight; a cold Everyone panel measured ~6.5 s. These make it one round trip:

```
GET /social/reviews/counts?items=tmdb:movie:809:movie,mal:42310:anime
    → { "tmdb:movie:809|movie": { "ratings": 240, "reviews": 128, "avg": 7.4, "stars": 310, "comments": 44 }, ... }

GET /social/u/{handle}/ratings?itemKey=tmdb:movie:809&mediaType=movie
    → { "items": [Review] }        // filter by title inside one history, instead of paging
```

A details page needs, at minimum, "which of my friends rated this, with avatars" in one call:

```
GET /social/reviews/friends-summary?itemKey=…&mediaType=…
    → { "count": 3, "ratings": 41, "avatars": [{ "handle", "alias", "avatarUrl", "score" }] }
```

### P1-6 A complete user directory and search

`GET /social/users` and `GET /social/users/search?q=` both answer 404. The app therefore builds a
directory out of group members and friends-of-friends (78 people when measured, versus the real
account count), and partial-handle search only covers that pool. The client already calls the
search route and latches it off after a 404, so shipping it needs no client change.

```
GET /social/users?cursor=&limit=50&sort=active|new
    → { "users": [{ "handle", "alias", "avatarUrl", "verified", "online", "slogan" }], "nextCursor": "...", "total": 4213 }

GET /social/users/search?q=be
    → { "users": [ … same shape … ] }      // prefix first, then contains; case-insensitive; alias and handle both match
```

Must be cheap enough to call while typing (the client debounces at 220–250 ms) and should cap the
result set (`limit=20`) rather than return everything.

### P1-7 Title summary

For the entry point to show a community number without loading reviews:

```
GET /social/titles/{mediaType}/{itemKey}/summary
    → { "ratings": 240, "reviews": 128, "avg": 7.4, "stars": 310, "comments": 44, "friends": 3 }
```

Bulk variant for rails/home: `GET /social/titles/summary?items=tmdb:movie:809:movie,...`.

---

## 4. Priority 2 — mandatory for existing/future social features

| Gap                       | Why it blocks something real                                                                                               | Proposed route(s)                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No blocking / muting      | `friendStatus` already has `"blocked"`, but nothing can set it; blocked people still appear in feeds, reviews and comments | `POST/DELETE /social/users/{handle}/block`, `POST/DELETE /social/users/{handle}/mute`                                                                                  |
| No reporting              | Reviews and comments can be posted but not reported; moderation is off-platform                                            | `POST /social/reviews/{id}/report`, `POST /social/u/{handle}/comments/{id}/report`, `POST /social/reviews/{id}/comments/{id}/report`, body `{ reason: "spam            | abuse             | spoiler                                                          | other", note? }`                                                                                                        |
| Comment editing           | Composer writes only; a typo can only be deleted                                                                           | `PATCH /social/u/{handle}/comments/{id}` (mirror the review comment route)                                                                                             |
| Notification entity types | Notifications exist, but nothing emits/links "someone starred your review" or "replied to your review"                     | add `review_star`, `review_comment`, `review_reply` with `entityType: "review"`, `entityId: <review id>`; the client already renders arbitrary `entityType`/`targetId` |
| Paginated friends         | `/social/u/{handle}/friends` returns everything; large accounts are one big payload                                        | `?cursor=&limit=` on the existing route, same page envelope                                                                                                            |
| Presence batch            | Avatars ask per profile; a list of 40 reviews needs 40 presence reads                                                      | `GET /social/presence?handles=a,b,c` → `{ "a": { online, presence }, … }`                                                                                              |
| Review discovery          | Nothing to power "reviews your friends liked" or a reviews rail                                                            | `GET /social/reviews/top?window=week&mediaType=&limit=`, `GET /social/reviews/search?q=`                                                                               |
| Activity visibility       | Activity is per-profile and friends-only; no global or topic feed                                                          | `GET /social/activity?scope=friends                                                                                                                                    | everyone&cursor=` |
| New media types           | `mediaType` is `movie                                                                                                      | series                                                                                                                                                                 | anime             | manga` only; books/eBooks/games/music are not rateable in Harbor | if Harbor starts rating them, extend the enum **and** the rating table before the UI ships, so history stays consistent |
| Direct messages / parties | Explicitly out of scope now, but the current model has no thread or membership primitive                                   | `GET/POST /social/dm/threads`, `POST /social/dm/threads/{id}/messages`, later `GET /social/realtime/ticket`                                                            |

---

## 5. Contract details that prevent bugs on our side

1. **Ids, not keys.** Stars/comments/reports keyed on `(itemKey, mediaType, handle)` are hostile:
   the rater's handle can change, and "the same review" is ambiguous after an edit. Use `review.id`.
2. **Counters in responses.** Every mutation returns the new counter; the client reconciles instead
   of adding 1 locally. Two devices starring at once must not drift.
3. **Idempotency.** `POST /stars` twice = one star. `DELETE` on a missing star = `200 {starred:false}`,
   not 404, so retries are safe.
4. **Ordering and cursors.** Cursor pagination must be stable under inserts (`(at, id)` ordering).
   `sort=stars|comments` needs the same stable tie-break.
5. **Deletes cascade.** Deleting a rating removes its review, stars and review comments, and the
   title summary that same request. The client removes the row optimistically and refetches.
6. **Privacy.** `ratings` visibility and `private` profiles already exist; the new review routes must
   honour them identically (a hidden rating must not leak through `scope=everyone`).
7. **Rate limits.** 429 with `Retry-After`; the client already handles 429 on comments and ratings.
8. **Spoilers.** Keep `spoiler` on the review row, not as a client convention.
9. **Localisation-neutral payloads.** Reviews carry user text; never machine-translate server-side.
10. **Staging credentials.** Friend-only routes cannot be exercised anonymously, so a staging
    account (or a documented test token) is needed to verify the Friends view end-to-end.

---

## 6. Acceptance checks (curl, replace `$T` with a bearer token)

```bash
B=https://harborcommunity.site/themes/api/social

# review identity + counts
curl -s "$B/reviews?itemKey=tmdb:movie:809&mediaType=movie&scope=everyone&limit=5" | jq
curl -s "$B/reviews?itemKey=tmdb:movie:809&mediaType=anime&scope=everyone" | jq '.items|length'   # must be 0

# stars are per review and never touch the score
curl -s -X POST -H "authorization: Bearer $T" "$B/reviews/$ID/stars" | jq   # {stars: n+1, starred: true}
curl -s -X POST -H "authorization: Bearer $T" "$B/reviews/$ID/stars" | jq   # same n+1, no duplicate
curl -s -X DELETE -H "authorization: Bearer $T" "$B/reviews/$ID/stars" | jq # n again

# comments on a review
curl -s -X POST -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"body":"Nice write-up"}' "$B/reviews/$ID/comments" | jq
curl -s "$B/reviews/$ID/comments" | jq '.total'

# friends scope requires auth
curl -s -o /dev/null -w '%{http_code}\n' "$B/reviews?itemKey=tmdb:movie:809&mediaType=movie&scope=friends"  # 401

# directory + partial search
curl -s "$B/users/search?q=be" | jq '.users[].handle'
curl -s "$B/users?limit=5" | jq '.total'

# summary
curl -s "$B/titles/movie/tmdb:movie:809/summary" | jq
```

---

## 7. What changes in the app the day each route ships

- `GET /social/reviews?…` → the reviews panel stops assembling histories; Everyone becomes complete
  and instant, and `sort=stars|comments` turns on. No UI rewrite: the panel already has scope,
  sort and pagination wired, and its data module is a single file to swap.
- Stars → a star button appears on every review card (currently deliberately absent), with real
  counts, and the "Most stars" sort becomes available.
- Review comments → the thread leaves the profile-comment mapping and gets real per-review counts
  in the list payload, removing one request per visible reviewer.
- `/social/users/search` → the existing latch opens automatically: partial-handle search becomes
  global with no client change.
- `/social/users` → the People directory becomes exhaustive instead of graph-derived.
- `/social/reviews/friends-summary` → the details-page avatar stack becomes one request instead of
  a friend-history scan, so it can appear on every title without cost.
