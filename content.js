/**
 * content.js - injected into every page.
 *
 * Intercepts clicks on torrent-related links and sends them to
 * the background script which forwards them to qBittorrent.
 *
 * Detection tiers (in order of confidence):
 *   1. magnet: URI                   -> immediate send
 *   2. .torrent extension in path    -> immediate send (proxy via extension)
 *   3. Jackett/Prowlarr API key URL  -> immediate send (qBt fetches directly)
 *   4. Other HTTP link               -> HEAD request to check Content-Type
 *   5. Anything else                 -> ignored
 *
 * IMPORTANT: e.preventDefault() must be called synchronously (before any
 * await), so settings are cached in module scope and updated via
 * storage.onChanged rather than fetched on each click.
 */
(function () {
  if (window.__qbtContentInjected) return;
  window.__qbtContentInjected = true;

  // --- cached settings (avoids async gap before e.preventDefault) -----------

  let interceptClicks = true;

  browser.storage.local.get({ interceptClicks: true }).then((s) => {
    interceptClicks = s.interceptClicks;
  });

  browser.storage.onChanged.addListener((changes) => {
    if ("interceptClicks" in changes) {
      interceptClicks = changes.interceptClicks.newValue;
    }
  });

  // --- detection helpers ----------------------------------------------------

  function isMagnet(href) {
    return typeof href === "string" && href.startsWith("magnet:");
  }

  function isDefinitelyTorrent(href) {
    if (!href || !href.startsWith("http")) return false;
    try {
      const u = new URL(href);
      const path = u.pathname.toLowerCase();

      // Path ends with .torrent
      if (path.endsWith(".torrent")) return true;

      // Jackett: /dl/<indexer>/ with jackett_apikey param
      if (path.includes("/dl/") && u.searchParams.has("jackett_apikey")) return true;

      // Prowlarr: /dl/<id> with apikey param
      if (path.includes("/dl/") && u.searchParams.has("apikey")) return true;

      // file= query parameter ends with .torrent (some indexers)
      if ((u.searchParams.get("file") || "").toLowerCase().endsWith(".torrent")) return true;

    } catch { /* ignore invalid URLs */ }
    return false;
  }

  function mightBeTorrent(href) {
    // Candidate for HEAD check: any http/https link that isn't obviously
    // a regular web page (html, images, scripts, etc.)
    if (!href || !href.startsWith("http")) return false;
    try {
      const u = new URL(href);
      const path = u.pathname.toLowerCase();
      if (path === "/" || path === "") return false;
      if (/\.(html?|php|asp|jsp|aspx|cfm|png|jpe?g|gif|svg|webp|css|js|mjs|xml|json|txt|pdf)$/.test(path)) return false;
      return true;
    } catch { return false; }
  }

  // --- click handler --------------------------------------------------------

  document.addEventListener("click", async (e) => {
    if (!e.isTrusted) return;
    if (!interceptClicks) return; // synchronous, no async gap

    let target = e.target;
    while (target && target.tagName !== "A") target = target.parentElement;
    if (!target) return;

    const href = target.href;
    if (!href) return;

    // Tier 1: magnet
    if (isMagnet(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      browser.runtime.sendMessage({ type: "ADD_MAGNET", url: href });
      return;
    }

    // Tier 2 & 3: known torrent URL patterns
    if (isDefinitelyTorrent(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      browser.runtime.sendMessage({ type: "ADD_TORRENT", url: href });
      return;
    }

    // Tier 4: uncertain - HEAD check (prevent default first to allow async)
    if (mightBeTorrent(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isTorrent = await browser.runtime.sendMessage({ type: "CHECK_URL", url: href });
      if (isTorrent) {
        browser.runtime.sendMessage({ type: "ADD_TORRENT", url: href });
      } else {
        // Not a torrent - open normally via background (avoids popup blocker)
        browser.runtime.sendMessage({ type: "OPEN_URL", url: href });
      }
    }
  }, true); // capture phase to beat other handlers

})();
