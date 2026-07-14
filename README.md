# YouTube Music — Play Liked by Artist

A Chrome extension that adds a **"Play liked"** button to an artist's page on
[YouTube Music](https://music.youtube.com). Clicking it collects every song
you've liked by that artist, shuffles them, and starts playback.

## Install (unpacked, for testing)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder (the one containing
   `manifest.json`).
4. Open an artist page on <https://music.youtube.com> (a URL like
   `music.youtube.com/channel/UC…`). The **Play liked** button appears next to
   the artist's Shuffle / Radio controls.

After changing code: return to `chrome://extensions`, click the reload icon on
the extension card, then reload the YouTube Music tab.

## How it works

| File | Role |
| --- | --- |
| `src/content.js` | Detects artist pages (SPA-aware), injects the button, and orchestrates the click flow. |
| `src/main-world.js` | Runs in the page's MAIN world to read YouTube's `ytcfg` (InnerTube API key + client context) and relays it to `content.js`. |
| `src/background.js` | Builds a temporary playlist from the shuffled video IDs (a cross-origin call the page can't make). |
| `src/inject.css` | Button + toast styling, matched to YT Music's header pills. |

The click flow:

1. Read the InnerTube session config from the page.
2. Fetch the **Liked Music** playlist (`browseId: VLLM`) via InnerTube,
   following continuations, authenticated with the `SAPISIDHASH` header.
3. Keep only songs whose artist matches the current page (by channel id, or by
   name as a fallback).
4. Shuffle, then create a temporary YouTube playlist via
   `youtube.com/watch_videos` and navigate to it — playback follows the
   pre-shuffled order.

## Known fragile spots (expect to tweak during testing)

These depend on YouTube internals and are the first places to look if something
misbehaves. They're isolated into small helpers on purpose.

- **Button placement** — `findActionRow()` in `content.js` anchors to the
  header's play button. If the button lands in the wrong spot, adjust the
  selectors there.
- **Playback** — relies on YT Music accepting a `watch_videos` temp playlist
  (`list=TLPQ…`). If it doesn't play, this is the piece to rethink.
- **Auth** — `buildAuthHeader()` reads the `__Secure-3PAPISID` / `SAPISID`
  cookie. If liked-song fetches return HTTP 401/403, auth is the cause.

Open the YouTube Music tab's DevTools console and filter for `[YTML]` to see
what happened at each step.

## Status

v0.1.0 — pre-release, unpublished. Not affiliated with YouTube or Google.
