# Privacy Policy

**YouTube Music — Play Liked by Artist**
_Last updated: 2026-07-15_

This browser extension is designed to do all of its work **locally, inside your
own browser**. It has no backend server, and the developer receives **no data
from you whatsoever**.

## What the extension accesses

To do its job, the extension needs to know which songs you have liked on
YouTube Music:

- **Your liked songs.** When you use the extension, it requests your "Liked
  Music" list through YouTube Music's own internal API — the same requests the
  YouTube Music website itself makes — authenticated with the session you are
  **already signed in to** in your browser. It reads song titles, video IDs, and
  artist names/IDs so it can filter by artist.
- **Your existing YouTube/Google session.** To make those authenticated
  requests, the extension reads the relevant authentication cookie already
  present in your browser for `music.youtube.com`. It uses this only to sign the
  API request, exactly as the website does. It is never copied or sent anywhere
  else.

## What the extension stores

- A **local cache** of your liked-songs list is saved in your browser via
  `chrome.storage.local` (with a 12-hour expiry) so the extension responds
  instantly and doesn't re-download the list every time. This data never leaves
  your device and is removed if you uninstall the extension or clear its
  storage.

## What the extension does NOT do

- It does **not** send your liked songs, your identity, your cookies, or any
  other data to the developer or to any third party.
- It does **not** use analytics, tracking, advertising, or fingerprinting.
- It does **not** sell or share any data.
- It makes no network requests other than to `music.youtube.com` and
  `www.youtube.com` for the sole purpose of reading your likes and starting
  playback (via a temporary `watch_videos` playlist), on your behalf.

## Permissions, briefly

- `storage` — to cache your liked list locally (above).
- Access to `music.youtube.com` — where the extension runs and reads your likes.
- Access to `www.youtube.com` — only to create the temporary playlist that
  starts shuffled playback.

## Children

The extension is a general-purpose utility and is not directed at children.

## Changes

If this policy changes, the updated version will be published in this file in
the project's public repository, with a new "Last updated" date.

## Contact

Questions or concerns? Please open an issue on the project's GitHub repository:
<https://github.com/iliatankelevich/youtube-music-liked-and-loaded/issues>

---

_This extension is not affiliated with, endorsed by, or sponsored by YouTube or
Google. "YouTube Music" is a trademark of Google LLC._
