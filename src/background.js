// Service worker. Its one job is the cross-origin call the content script can't
// make: building a temporary YouTube playlist from a list of video IDs.
//
// www.youtube.com/watch_videos?video_ids=a,b,c creates an anonymous "temp"
// playlist and 302-redirects to a watch URL containing its id (list=TLPQ...).
// Extensions with host_permissions bypass CORS, so the worker can follow the
// redirect and read the resulting URL — a page script cannot.

const WATCH_VIDEOS_ENDPOINT = "https://www.youtube.com/watch_videos";
// A temp playlist tops out around 50 videos; keep well within that.
const MAX_VIDEOS = 50;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "ytml-temp-playlist") {
    createTempPlaylist(message.videoIds)
      .then((listId) => sendResponse({ ok: true, listId }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

async function createTempPlaylist(videoIds) {
  const ids = (Array.isArray(videoIds) ? videoIds : []).filter(Boolean).slice(0, MAX_VIDEOS);
  if (!ids.length) throw new Error("No videos to play");

  const url = `${WATCH_VIDEOS_ENDPOINT}?video_ids=${ids.join(",")}`;
  const res = await fetch(url, { credentials: "include", redirect: "follow" });

  // The playlist id lives in the redirected URL. Fall back to scanning the body
  // in case a redirect wasn't followed as expected.
  let listId = matchListId(res.url);
  if (!listId) {
    const text = await res.text();
    listId = matchListId(text);
  }
  if (!listId) throw new Error("Could not obtain a playlist id from YouTube");
  return listId;
}

function matchListId(str) {
  if (!str) return null;
  // Anonymous playlists minted by watch_videos are long ids (commonly TLPQ…/
  // TLGG…); match any list= value rather than pinning to one prefix.
  const m = String(str).match(/[?&"]list=([A-Za-z0-9_-]{16,})/);
  return m ? m[1] : null;
}
