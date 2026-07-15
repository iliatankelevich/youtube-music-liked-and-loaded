# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goal

A Chrome extension for **YouTube Music** (`music.youtube.com`) that shuffle-plays
the songs the user has liked, filtered to chosen artists. Two entry points:

- **"Play liked" button** injected onto an artist's page → the songs liked from
  *that* artist.
- **Artist multi-select bar** injected next to the global search box (present on
  every page) → type/pick several artists as chips, press play, and get the
  **union** of your liked songs by all of them. The selection resets on play.

Both start a **shuffled** queue and share the same fetch/filter/play machinery.

## Current status

v0.1.0, pre-release. A working MV3 extension is scaffolded (no build step — plain
JS/CSS loaded unpacked). No tests or bundler yet. The playback path and auth are
the parts most likely to need live iteration (see "fragile spots" below).

## Why this is non-trivial (read before building)

The hard parts of this project are all consequences of how YouTube Music works,
not of Chrome extension mechanics:

- **YT Music is a single-page app.** Navigating between pages does not reload the
  document, so a content script that only runs on `document_idle` will fire once
  and never again. Detect in-app navigation and re-evaluate whether the current
  page is an artist page each time, re-injecting the button as needed. **Do not
  rely on a single nav event name**: `yt-navigate-finish`/`yt-page-data-updated`
  have stopped firing on current builds (a nav now looks like `yt-navigate` →
  `yt-rendererstamper-finished`). content.js listens to a broad set of yt events
  *and* polls `location.href` for changes as a name-independent safety net.
- **The DOM is Polymer/custom-elements and heavily virtualized.** Class names are
  unstable and lists render lazily as you scroll. Prefer anchoring to stable
  structural landmarks and `aria`/role attributes over generated class names, and
  expect selectors to need maintenance when YouTube ships UI changes.
- **"Liked songs from this artist" is not a first-class list.** YT Music exposes
  a global "Liked Music" auto-playlist but not a per-artist liked view. The core
  problem is producing that filtered set. Decide early between:
  - scraping/paginating the user's liked songs and filtering by artist, vs.
  - using the private InnerTube API that the web app itself calls.
  This choice drives the whole architecture — resolve it before writing UI code.
- **Shuffle + queue control** must go through YT Music's own player/queue rather
  than a homemade audio player, so identify how the app enqueues tracks (queue
  endpoints / clicking through the app's own "shuffle" affordance) and reuse it.

## Architecture (Manifest V3)

Three scripts, split by the boundary that actually matters — which world/origin
can do what:

- **`src/content.js`** (ISOLATED world) — owns injection + lifecycle for **both**
  entry points (the artist-page button and the search-box artist bar), re-injected
  on any SPA navigation via broad yt-events + a URL-change poll, retrying while the
  DOM renders. Orchestrates play: fetch Liked Music via InnerTube, filter, shuffle,
  then hand off. `onClick()` (button) and `onArtistBarPlay()` (bar) share the
  extracted `getLikedSongs()` (cache-or-fetch) and `playShuffled()` (temp playlist
  + navigate) helpers and the same `filterByArtist()` predicate. Can do same-origin
  authenticated `fetch` but cannot see page JS globals.
- **`src/main-world.js`** (MAIN world) — its only reason to exist is that the
  ISOLATED script can't read the page's `ytcfg` (InnerTube API key + client
  context). It reads those and relays them over `postMessage`.
- **`src/background.js`** (service worker) — its only reason to exist is the one
  cross-origin call the page can't make: `youtube.com/watch_videos` to mint a
  temp playlist (`list=TLPQ…`) from the shuffled video IDs. Extensions bypass
  CORS for hosts in `host_permissions`; a page script cannot read the redirect.

Data flow on click: `content.js` → (config from `main-world.js`) → InnerTube
`browse VLLM` → filter/shuffle → `background.js` builds temp playlist →
`content.js` navigates to `watch?v=…&list=…`.

### Non-obvious implementation notes

- **Liked = `browseId: "VLLM"`** — the **Liked Music** auto-playlist, i.e. the
  songs the user thumbed-up. It is *not* `FEmusic_liked_videos`: that browseId is
  **Library › Songs** (songs *added to library*) and returns "No songs yet" for a
  user who only likes. An earlier version used `FEmusic_liked_videos` and always
  found 0 songs; VLLM had *looked* empty only because of the authuser bug below.
  Continuations are passed as **query params** (`?ctoken=&continuation=&type=next`),
  matching what the web app actually sends, not in the request body. Response
  parsing uses a generic tree-walk (`walk`/`extractSongs`/`extractContinuation`)
  rather than fixed JSON paths — deliberately, because YouTube reshapes these
  responses. Prefer fixing the predicate inside the walk over hard-coding paths.
- **Caching**: the full parsed liked list is cached in `chrome.storage.local`
  (12h TTL) so repeat clicks are instant; a background refresh runs after a cache
  hit. This is why `permissions: ["storage"]` exists.
- **Artist match** uses an *identity set* built by `resolveArtistIdentity()`: the
  page name + URL channel id, plus the channel ids **and** names read off the
  artist's own song rows (`musicResponsiveListItemRenderer`) from an InnerTube
  `browse` of the artist (a `/@handle` is turned into a browseId via
  `navigation/resolve_url` first). A liked song matches if its `artistIds`
  intersect that set **or** its normalized name is in it. This is necessary
  because the artist page and the liked song frequently use *different* channel
  ids (an artist page vs a "- Topic"/music channel) **and** different name scripts
  (e.g. a page titled "Korol i Shut" whose songs are tagged "Король и Шут").
  Matching by page name/id alone finds ~0.
- **Auth**: InnerTube personal data needs (1) the `SAPISIDHASH` Authorization
  header, derived from the `__Secure-3PAPISID`/`SAPISID` cookie
  (`buildAuthHeader`), and (2) `X-Goog-AuthUser` set to the page's
  **`SESSION_INDEX`** (relayed via the config bridge as `cfg.sessionIndex`).
  Hardcoding authuser `0` hits a different/empty account on multi-login profiles —
  that was the original "0 liked songs" bug.
- **Shuffle** happens client-side *before* the temp playlist is built, so plain
  in-order playback of that playlist is already randomized.
- **Artist bar autocomplete is local, not a search API.** `buildArtistIndex()`
  folds the cached liked list into artist groups `{ids, names, display, count}`,
  keyed by channel id but **merged on normalized name** (so "Korol i Shut" and
  "Король и Шут" collapse into one pickable entry, and typing either script finds
  it). Suggestions come only from artists you've actually liked — every pick is
  therefore guaranteed to have songs, and each chip already carries the exact
  ids+names the songs use, so play just unions the selected groups into one
  identity and reuses `filterByArtist()` — **no per-pick `resolveArtistIdentity()`
  round-trip.** This relies on `parseSong()` also emitting paired `artists:[{id,
  name}]` (the flat `artistIds`/`artistNames` lose the pairing on collaborations).
  The union temp playlist is still capped at `MAX_VIDEOS` (50) in background.js —
  a `watch_videos` limit — so many-artist selections play a random 50 of the union.

## Fragile spots (check these first when something breaks)

- **Button placement** — `findActionRow()` anchors to the header play button.
- **Artist-bar placement** — `findSearchBox()` anchors to `ytmusic-search-box`
  (falling back to the search `input`); the bar is inserted as its next sibling.
  Its dropdown is `position:fixed`, placed by `positionSuggest()` from the bar's
  rect, so nav-bar overflow can't clip it.
- **SPA re-injection** — if either UI appears on a hard load but not after in-app
  navigation, YT changed its nav events again: check which fire (the `NAV_EVENTS`
  list in content.js) and lean on the `location.href` poller. `onNav()` drives
  both `scheduleEnsure()` (button) and `scheduleEnsureBar()` (bar).
- **Playback** — depends on YT Music accepting a `watch_videos` temp playlist.
- **Auth** — HTTP 401/403 on liked fetch ⇒ `buildAuthHeader()` / cookie names.

Console logs are prefixed `[YTML]`.

## Build & run

No build step. Load unpacked at `chrome://extensions` (Developer mode →
"Load unpacked" → this directory). After edits, click the extension's reload
icon, then reload the `music.youtube.com` tab. **A page reload alone is not
enough** — Chrome serves the *cached* content script until the extension itself
is reloaded (or the browser is relaunched). If a bundler/linter/tests get added
later, document the actual commands (incl. single-test) here.
