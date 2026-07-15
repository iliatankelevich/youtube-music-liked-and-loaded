// Runs in the ISOLATED world on music.youtube.com. Responsibilities:
//   1. Detect artist pages (SPA-aware) and inject the "Play liked" button.
//   2. On click: fetch the user's Liked Music, keep only this artist's songs,
//      shuffle them, build a temp playlist, and start playback.
//
// The fragile, YouTube-shape-dependent logic (DOM selectors, InnerTube response
// parsing) is deliberately isolated into small helpers so it can be repaired in
// place when YouTube changes its markup or API.
(function () {
  "use strict";

  const TAG = "[YTML]";
  const BTN_ID = "ytml-play-liked-btn";
  const HEADER_SELECTORS =
    "ytmusic-immersive-header-renderer, ytmusic-visual-header-renderer, ytmusic-header-renderer";
  const ARTIST_URL = /^\/(channel\/UC[\w-]+|@[\w.-]+)/;

  const SHUFFLE_ICON =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
    '<path fill="currentColor" d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>' +
    "</svg>";

  // --------------------------------------------------------------------------
  // Config bridge (values come from main-world.js via postMessage)
  // --------------------------------------------------------------------------
  let cachedCfg = null;
  const cfgWaiters = [];

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.source === "ytml-cfg" && event.data.payload) {
      cachedCfg = event.data.payload;
      cfgWaiters.splice(0).forEach((resolve) => resolve(cachedCfg));
    }
  });

  function getConfig(timeoutMs = 10000) {
    if (cachedCfg) return Promise.resolve(cachedCfg);
    window.postMessage({ source: "ytml-cfg-request" }, location.origin);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out reading YouTube Music session")),
        timeoutMs
      );
      cfgWaiters.push((cfg) => {
        clearTimeout(timer);
        resolve(cfg);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Page detection & button injection
  // --------------------------------------------------------------------------
  // Artist pages use either /channel/UC… or /@handle URLs; both render an
  // immersive header. The header is the real signal that we're on an artist page.

  // YT Music caches previous pages in the DOM (hidden) during SPA navigation, so
  // more than one header can exist at once. Always target the *visible* one.
  function visibleHeader() {
    const headers = document.querySelectorAll(HEADER_SELECTORS);
    for (const h of headers) {
      const r = h.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return h;
    }
    return headers[0] || null;
  }

  function getArtist() {
    if (!ARTIST_URL.test(location.pathname)) return null;
    const header = visibleHeader();
    if (!header) return null; // not a rendered artist page (yet)
    const name = getArtistName(header);
    if (!name) return null;

    // Channel id is a nice-to-have for precise (language-independent) matching.
    // The /@handle URL doesn't contain it, so fall back to page metadata.
    let channelId = (location.pathname.match(/\/channel\/(UC[\w-]+)/) || [])[1] || null;
    if (!channelId) {
      for (const sel of ['link[rel="canonical"]', 'meta[property="og:url"]']) {
        const el = document.querySelector(sel);
        const val = el && (el.getAttribute("href") || el.getAttribute("content"));
        const m = val && val.match(/\/channel\/(UC[\w-]+)/);
        if (m) {
          channelId = m[1];
          break;
        }
      }
    }
    return { name, channelId, header };
  }

  function getArtistName(header) {
    const candidates = [
      "h1",
      ".title.style-scope.ytmusic-immersive-header-renderer",
      "h1 .title",
      ".title yt-formatted-string",
      "yt-formatted-string.title"
    ];
    for (const sel of candidates) {
      const el = header.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return document.title.replace(/\s*-\s*YouTube Music\s*$/, "").trim();
  }

  // Find the header's action row without hard-coding a selector: collect the
  // native action controls (Shuffle / Radio / Play / Subscribe …) and return the
  // element that is the direct parent of the most of them.
  function findActionRow(header) {
    const rx = /shuffle|radio|play|save|library|subscribe/i;
    // Top-level "button" custom elements — one per visible button. Used to
    // collapse a match, since one button is renderer > shape > button (3 nodes).
    const COMPONENT =
      "yt-button-renderer, ytmusic-play-button-renderer, " +
      "ytmusic-subscribe-button-renderer, ytmusic-toggle-button-renderer";
    const selector =
      'button, ytmusic-play-button-renderer, yt-button-shape, ' +
      'tp-yt-paper-button, a[role="button"], [role="button"]';

    // Collapse each matched node to its enclosing button component so a single
    // visual button is counted once, not once per nested node.
    const components = new Set();
    for (const el of header.querySelectorAll(selector)) {
      const label = (el.getAttribute("aria-label") || "") + " " + (el.textContent || "");
      if (!rx.test(label)) continue;
      components.add(el.closest(COMPONENT) || el);
    }

    // The action row is the element that directly parents the most components.
    const counts = new Map();
    for (const comp of components) {
      const parent = comp.parentElement;
      if (parent) counts.set(parent, (counts.get(parent) || 0) + 1);
    }
    let best = null;
    let bestCount = 0;
    for (const [parent, count] of counts) {
      if (count > bestCount) {
        best = parent;
        bestCount = count;
      }
    }
    return best;
  }

  // Last resort if no action row is found: sit next to the artist title.
  function fallbackRow(header) {
    const title = header.querySelector("h1, .title");
    return (title && title.parentElement) || header;
  }

  function makeButton() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.className = "ytml-play-liked-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Shuffle-play songs you liked by this artist");
    btn.setAttribute("title", "Shuffle-play songs you liked by this artist");
    btn.innerHTML = SHUFFLE_ICON + '<span class="ytml-label">Play liked</span>';
    btn.addEventListener("click", onClick);
    return btn;
  }

  function ensureButton(allowFallback) {
    const artist = getArtist();
    if (!artist) return false;
    // Already injected into *this* (visible) header? Done. Checking the header
    // rather than a global getElementById avoids being fooled by a stale button
    // left in a hidden, cached previous page.
    if (artist.header.querySelector("#" + BTN_ID)) return true;
    const row =
      findActionRow(artist.header) || (allowFallback ? fallbackRow(artist.header) : null);
    if (!row) return false;
    // Drop any stragglers from previous pages so the id stays unique.
    document
      .querySelectorAll("#" + BTN_ID)
      .forEach((b) => { if (!artist.header.contains(b)) b.remove(); });
    row.appendChild(makeButton());
    console.log(TAG, "button injected for", artist.name, "into", row.tagName.toLowerCase());
    return true;
  }

  // The header renders asynchronously after navigation, so retry for a while.
  let ensureTimer = null;
  function scheduleEnsure() {
    if (ensureTimer) clearInterval(ensureTimer);
    let ticks = 0;
    ensureTimer = setInterval(() => {
      ticks += 1;
      // Bail only when the URL clearly isn't an artist page. If it looks like
      // one, keep retrying — the header renders asynchronously and getArtist()
      // can be null for the first second or two after navigation.
      // Also give the real action row ~6s to render before falling back.
      const stop =
        !ARTIST_URL.test(location.pathname) || ensureButton(ticks >= 15) || ticks > 30;
      if (stop) {
        clearInterval(ensureTimer);
        ensureTimer = null;
      }
    }, 400);
  }

  // YouTube Music is a SPA, and which navigation event fires depends on the
  // build — `yt-navigate-finish`/`yt-page-data-updated` have stopped firing on
  // current builds, where a nav instead looks like `yt-navigate` →
  // `yt-rendererstamper-finished`. So don't depend on any single event name:
  //   (a) listen to a broad set of yt lifecycle events (harmless if absent), and
  //   (b) poll for URL changes as a name-independent safety net.
  // Every trigger just (re)starts scheduleEnsure(), whose retry loop then waits
  // for the new header to render. Without this, in-app navigation to an artist
  // page leaves the button un-injected even though the URL changes.
  const NAV_EVENTS = [
    "yt-navigate-finish",
    "yt-page-data-updated",
    "yt-navigate",
    "yt-rendererstamper-finished",
    "yt-page-type-changed"
  ];
  for (const ev of NAV_EVENTS) {
    document.addEventListener(ev, scheduleEnsure, true);
    window.addEventListener(ev, scheduleEnsure, true);
  }
  window.addEventListener("load", scheduleEnsure);

  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scheduleEnsure();
    }
  }, 700);

  scheduleEnsure();

  // --------------------------------------------------------------------------
  // Click handler / orchestration
  // --------------------------------------------------------------------------
  let running = false;

  async function onClick() {
    if (running) return;
    const artist = getArtist();
    if (!artist) return;

    running = true;
    setBusy(true);
    try {
      const cfg = await getConfig();

      // Resolve who this artist is (channel ids + name variants) while the liked
      // list loads — the two are independent, so overlap them.
      const identityP = resolveArtistIdentity(cfg, artist);

      // Use the cached liked list for an instant response when possible, and
      // refresh it in the background so the next click is up to date.
      let all = await getCachedSongs();
      if (all) {
        refreshCacheInBackground(cfg);
      } else {
        all = await fetchAllLiked(cfg);
        saveCache(all);
      }

      const identity = await identityP;
      const matches = filterByArtist(all, identity);
      console.log(
        TAG,
        `liked: ${all.length} total, ${matches.length} by "${artist.name}" ` +
          `(ids: ${[...identity.channelIds].join(",") || "none"})`
      );
      if (!matches.length) {
        if (all.length) {
          const names = [...new Set(all.flatMap((s) => s.artistNames))].slice(0, 25);
          console.log(TAG, "0 matches — distinct artist names in your likes:", names);
        }
        toast(`No liked songs found for ${artist.name}.`);
        return;
      }

      shuffle(matches);
      const videoIds = matches.map((s) => s.videoId);
      // The temp playlist becomes the Up Next queue: the first song plays and
      // the rest follow, already shuffled.
      const listId = await createTempPlaylist(videoIds);
      location.href =
        `https://music.youtube.com/watch?v=${encodeURIComponent(videoIds[0])}` +
        `&list=${encodeURIComponent(listId)}`;
    } catch (err) {
      console.error(TAG, err);
      toast(`Couldn't start playback: ${err.message}`);
    } finally {
      running = false;
      setBusy(false);
    }
  }

  function filterByArtist(songs, identity) {
    return songs.filter(
      (s) =>
        s.videoId &&
        (s.artistIds.some((id) => identity.channelIds.has(id)) ||
          s.artistNames.some((n) => identity.names.has(norm(n))))
    );
  }

  // Build the set of channel ids + names that identify *this* artist, so we can
  // recognise their liked songs regardless of which channel/name-spelling the
  // song links to. This is the crux: an artist page and that artist's song
  // entries frequently use different channel ids (e.g. an "artist" page vs a
  // "- Topic"/music channel) and different name scripts (e.g. a /@handle page
  // titled "Korol i Shut" whose songs are tagged "Король и Шут"). We bridge them
  // by browsing the artist and reading the channel ids + names off the artist's
  // *own* song rows (Top songs / Videos / Live), which share the song channel.
  //
  // Only musicResponsiveListItemRenderer (song rows) are read, so related-artist
  // carousels ("Fans might also like") — which are card renderers — are ignored.
  async function resolveArtistIdentity(cfg, artist) {
    const channelIds = new Set();
    const names = new Set();
    if (artist.name) names.add(norm(artist.name));
    if (artist.channelId) channelIds.add(artist.channelId);

    try {
      // A /channel/UC… page gives the id directly; a /@handle page needs a
      // resolve_url round-trip to turn the handle into a browseId.
      const browseId = artist.channelId || (await resolveArtistBrowseId(cfg));
      if (browseId) {
        channelIds.add(browseId);
        const data = await innertubeFetch(cfg, "browse", {
          context: cfg.context,
          browseId
        });
        for (const song of extractSongs(data)) {
          for (const id of song.artistIds) channelIds.add(id);
          for (const n of song.artistNames) names.add(norm(n));
        }
      }
    } catch (e) {
      // Non-fatal: fall back to the page name / URL channel id gathered above.
      console.debug(TAG, "artist identity resolve failed; using page name/id", e);
    }
    return { channelIds, names };
  }

  async function resolveArtistBrowseId(cfg) {
    const data = await innertubeFetch(cfg, "navigation/resolve_url", {
      context: cfg.context,
      url: location.href
    });
    let browseId = null;
    walk(data, (n) => {
      if (browseId || !n) return;
      const be = n.browseEndpoint;
      if (be && typeof be.browseId === "string" && be.browseId.startsWith("UC")) {
        browseId = be.browseId;
      }
    });
    return browseId;
  }

  // --------------------------------------------------------------------------
  // Liked songs fetching (InnerTube, browseId FEmusic_liked_videos)
  // --------------------------------------------------------------------------
  async function fetchAllLiked(cfg) {
    const byId = new Map();
    const seenTokens = new Set();
    let token = null;

    for (let page = 0; page < 60; page += 1) {
      const data = await innertubeBrowse(cfg, token);
      for (const song of extractSongs(data)) {
        if (song.videoId && !byId.has(song.videoId)) byId.set(song.videoId, song);
      }
      token = extractContinuation(data);
      if (!token || seenTokens.has(token)) break;
      seenTokens.add(token);
    }
    return [...byId.values()];
  }

  // Generic authenticated InnerTube POST. `query` is an extra query string used
  // for continuations (the web app passes those as ?ctoken=&continuation=&type=,
  // not in the body). Personalized endpoints require X-Goog-AuthUser to point at
  // the *page's* signed-in account (cfg.sessionIndex) — hardcoding "0" hits a
  // different/empty account on multi-login profiles and returns nothing.
  async function innertubeFetch(cfg, path, body, query = "") {
    const url = `https://music.youtube.com/youtubei/v1/${path}?prettyPrint=false${query}`;
    const headers = {
      "Content-Type": "application/json",
      "X-Goog-AuthUser": String(cfg.sessionIndex != null ? cfg.sessionIndex : "0"),
      "X-Origin": location.origin
    };
    if (cfg.visitorData) headers["X-Goog-Visitor-Id"] = cfg.visitorData;
    const auth = await buildAuthHeader();
    if (auth) headers["Authorization"] = auth;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include"
    });
    if (!res.ok) throw new Error(`InnerTube ${path} failed (HTTP ${res.status})`);
    return res.json();
  }

  // token === null → first page: browse the "Liked Music" auto-playlist (VLLM),
  // which holds the songs the user thumbed-up. (NOT FEmusic_liked_videos — that
  // is Library › Songs, i.e. songs *added to library*, a different list.)
  function innertubeBrowse(cfg, token) {
    if (token) {
      const t = encodeURIComponent(token);
      return innertubeFetch(
        cfg,
        "browse",
        { context: cfg.context },
        `&ctoken=${t}&continuation=${t}&type=next`
      );
    }
    return innertubeFetch(cfg, "browse", { context: cfg.context, browseId: "VLLM" });
  }

  // --------------------------------------------------------------------------
  // Liked-list cache (chrome.storage.local)
  // --------------------------------------------------------------------------
  const CACHE_KEY = "ytml-liked-cache";
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  let refreshing = false;

  function getCachedSongs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(CACHE_KEY, (obj) => {
          if (chrome.runtime.lastError) return resolve(null);
          const c = obj && obj[CACHE_KEY];
          const fresh = c && Date.now() - c.ts < CACHE_TTL_MS;
          resolve(fresh && Array.isArray(c.songs) && c.songs.length ? c.songs : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function saveCache(songs) {
    try {
      chrome.storage.local.set({ [CACHE_KEY]: { ts: Date.now(), songs } });
    } catch (e) {
      console.debug(TAG, "cache save failed", e);
    }
  }

  function refreshCacheInBackground(cfg) {
    if (refreshing) return;
    refreshing = true;
    fetchAllLiked(cfg)
      .then((songs) => {
        if (songs.length) saveCache(songs);
        console.debug(TAG, `cache refreshed: ${songs.length} liked songs`);
      })
      .catch((e) => console.debug(TAG, "cache refresh failed", e))
      .finally(() => {
        refreshing = false;
      });
  }

  // YouTube authenticates data requests with an Authorization header derived
  // from the *APISID cookie: "SAPISIDHASH <ts>_<sha1(ts SPACE cookie SPACE origin)>".
  async function buildAuthHeader() {
    const sapisid =
      getCookie("__Secure-3PAPISID") ||
      getCookie("SAPISID") ||
      getCookie("__Secure-1PAPISID");
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const digest = await sha1Hex(`${ts} ${sapisid} ${location.origin}`);
    return `SAPISIDHASH ${ts}_${digest}`;
  }

  function getCookie(name) {
    const escaped = name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&");
    const m = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function sha1Hex(str) {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // --------------------------------------------------------------------------
  // InnerTube response parsing (resilient tree-walk, not fixed paths)
  // --------------------------------------------------------------------------
  function extractSongs(root) {
    const out = [];
    walk(root, (node) => {
      if (node && node.musicResponsiveListItemRenderer) {
        const song = parseSong(node.musicResponsiveListItemRenderer);
        if (song.videoId) out.push(song);
      }
    });
    return out;
  }

  function parseSong(renderer) {
    let videoId =
      (renderer.playlistItemData && renderer.playlistItemData.videoId) || null;
    const artistIds = [];
    const artistNames = [];

    for (const col of renderer.flexColumns || []) {
      const flex = col.musicResponsiveListItemFlexColumnRenderer;
      const runs = flex && flex.text && flex.text.runs;
      if (!runs) continue;
      for (const run of runs) {
        const be =
          run.navigationEndpoint && run.navigationEndpoint.browseEndpoint;
        if (be && typeof be.browseId === "string" && be.browseId.startsWith("UC")) {
          artistIds.push(be.browseId);
          if (run.text) artistNames.push(run.text);
        }
      }
    }

    if (!videoId) {
      walk(renderer, (n) => {
        if (!videoId && n && n.watchEndpoint && n.watchEndpoint.videoId) {
          videoId = n.watchEndpoint.videoId;
        }
      });
    }
    return { videoId, artistIds, artistNames };
  }

  function extractContinuation(root) {
    let token = null;
    walk(root, (n) => {
      if (token || !n) return;
      if (n.continuationCommand && n.continuationCommand.token) {
        token = n.continuationCommand.token;
      } else if (n.nextContinuationData && n.nextContinuationData.continuation) {
        token = n.nextContinuationData.continuation;
      }
    });
    return token;
  }

  function walk(node, visit) {
    if (!node || typeof node !== "object") return;
    visit(node);
    if (Array.isArray(node)) {
      for (const child of node) walk(child, visit);
    } else {
      for (const key in node) walk(node[key], visit);
    }
  }

  // --------------------------------------------------------------------------
  // Temp playlist (delegated to the background service worker)
  // --------------------------------------------------------------------------
  function createTempPlaylist(videoIds) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "ytml-temp-playlist", videoIds },
        (resp) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!resp || !resp.ok) {
            reject(new Error((resp && resp.error) || "Failed to create playlist"));
          } else {
            resolve(resp.listId);
          }
        }
      );
    });
  }

  // --------------------------------------------------------------------------
  // Small helpers
  // --------------------------------------------------------------------------
  function norm(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function setBusy(busy) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    btn.classList.toggle("ytml-busy", busy);
    btn.disabled = busy;
    const label = btn.querySelector(".ytml-label");
    if (label) label.textContent = busy ? "Loading…" : "Play liked";
  }

  let toastTimer = null;
  function toast(message) {
    let el = document.getElementById("ytml-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ytml-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("ytml-toast-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("ytml-toast-visible"), 5000);
  }
})();
