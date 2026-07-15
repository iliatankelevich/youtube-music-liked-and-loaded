# Chrome Web Store listing — copy/paste fields

Everything the Developer Dashboard asks for, ready to paste. Fields are grouped
by the dashboard tab they appear under.

---

## Store listing tab

**Item name** (max 75 chars)

```
Liked & Loaded — Play liked by artist (for YouTube Music)
```

**Summary** (short description, max 132 chars)

```
Shuffle-play the songs you've liked on YouTube Music — by one artist, or several at once from a picker next to the search bar.
```

**Category**

```
Entertainment
```
(If you'd rather, "Tools" also fits — pick whichever from the dropdown.)

**Language**

```
English (United States)
```

**Detailed description** (max 16,000 chars — plain text)

```
Play the songs YOU liked, by the artists you want — shuffled.

YouTube Music lets you "like" songs, but it won't play back just your liked
songs from a given artist. This extension adds exactly that, in two places:

• On any artist's page — a "Play liked" button next to Shuffle / Radio. One
  click shuffle-plays only the songs you've liked by that artist.

• Next to the global search bar — an artist picker. Type an artist, add a few
  as tags, hit play, and it shuffle-plays the combined set of your liked songs
  by all of them. The picker only suggests artists you've actually liked, so
  every choice has songs.

How to use:
1. Install and open music.youtube.com.
2. Either open an artist page and click "Play liked", or use the artist bar to
   the right of the search box: type a name, pick artists, press the play
   button.
3. Enjoy a shuffled queue of just your likes.

Privacy first:
This extension does its work entirely inside your own browser. It reads your
liked songs through YouTube Music's own interface, using the session you're
already signed in to, and caches them locally so it's fast. It does NOT send
your data anywhere — no servers, no analytics, no tracking. See the privacy
policy for details.

Notes:
• You need to be signed in to YouTube Music.
• Open source — code and issue tracker on GitHub.
• Not affiliated with, endorsed by, or sponsored by YouTube or Google.
```

---

## Privacy practices tab

**Single purpose** (one sentence)

```
This extension shuffle-plays the user's liked YouTube Music songs, filtered to one or more artists they choose.
```

**Permission justifications**

- `storage`
```
Caches the user's liked-songs list in local browser storage (chrome.storage.local) so the feature responds instantly and doesn't re-fetch the whole list on every use. Nothing is stored remotely.
```

- Host permission `https://music.youtube.com/*`
```
This is where the extension runs. It injects the "Play liked" button and the artist picker, and reads the user's liked songs via YouTube Music's own InnerTube API using the session the user is already signed in to.
```

- Host permission `https://www.youtube.com/*`
```
Used solely to create a temporary playlist via youtube.com/watch_videos from the chosen songs — this is the mechanism that actually starts shuffled playback. No browsing data is read from youtube.com.
```

**Data collection disclosure** (the dashboard checklist)

```
Select: "This item does NOT collect or use user data" is NOT accurate because
the extension reads your liked songs — but it does not TRANSMIT them to the
developer. In the checklist, do not tick any of the data-type boxes (we don't
collect/send any of them off-device), then certify the three statements:
  ✓ I do not sell or transfer user data to third parties (outside approved use cases)
  ✓ I do not use or transfer user data for purposes unrelated to the single purpose
  ✓ I do not use or transfer user data to determine creditworthiness / for lending
```

**Privacy policy URL** — host `PRIVACY.md` (see below for where) and paste its public URL, e.g.
```
https://github.com/iliatankelevich/youtube-music-liked-and-loaded/blob/main/PRIVACY.md
```

---

## Graphic assets tab

- **Store icon**: `icons/icon128.png` (128×128) — already in the repo.
- **Screenshots** (need 1–5; 1280×800): `store/screenshots/01-artist-page.png`,
  `store/screenshots/02-autocomplete.png`.
- **Small promo tile** (440×280): `store/promo-tile-440x280.png` — ready to upload.
- **Marquee promo tile** (1400×560): `store/promo-marquee-1400x560.png` — ready to upload.

---

## Package to upload

`dist/youtube-music-liked-and-loaded-0.4.0.zip` (built by `store/package.sh`).
