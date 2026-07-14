// Runs in the page's MAIN world so it can read YouTube Music's `ytcfg` globals
// (InnerTube API key + client context), which the ISOLATED content script cannot
// see. It relays those values over window.postMessage to content.js.
//
// ytcfg is populated asynchronously during page boot, so we poll until it is
// ready and also answer on-demand requests from the content script.
(function () {
  "use strict";

  function readConfig() {
    try {
      var cfg = window.ytcfg;
      if (!cfg || typeof cfg.get !== "function") return null;
      var apiKey = cfg.get("INNERTUBE_API_KEY");
      var context = cfg.get("INNERTUBE_CONTEXT");
      if (!apiKey || !context) return null;
      // Which signed-in account the page is using. Personalized InnerTube calls
      // (liked songs) must send this as X-Goog-AuthUser or they hit account 0,
      // which may be a different/empty account (multi-login profiles).
      var sessionIndex = cfg.get("SESSION_INDEX");
      return {
        apiKey: apiKey,
        context: context,
        sessionIndex:
          sessionIndex === undefined || sessionIndex === null
            ? "0"
            : String(sessionIndex),
        visitorData:
          cfg.get("VISITOR_DATA") ||
          (context.client && context.client.visitorData) ||
          ""
      };
    } catch (e) {
      return null;
    }
  }

  function publish(payload) {
    window.postMessage({ source: "ytml-cfg", payload: payload }, location.origin);
  }

  // Reply when the content script explicitly asks.
  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data) return;
    if (event.data.source === "ytml-cfg-request") {
      var cfg = readConfig();
      if (cfg) publish(cfg);
    }
  });

  // Proactively push the config as soon as it becomes available.
  var attempts = 0;
  var timer = setInterval(function () {
    attempts += 1;
    var cfg = readConfig();
    if (cfg) {
      publish(cfg);
      clearInterval(timer);
    } else if (attempts > 60) {
      clearInterval(timer); // give up after ~30s
    }
  }, 500);
})();
