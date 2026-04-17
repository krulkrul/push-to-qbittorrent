/**
 * content.js - injected into every page.
 *
 * Intercepts clicks on torrent links and sends them to the background script.
 * Only active when the user has enabled click interception in settings.
 *
 * Settings cache: settings are read once at load and kept in sync via
 * storage.onChanged. This avoids an async gap before e.preventDefault(),
 * which would let the browser navigate before we can cancel it.
 */
(function () {
  if (window.__qbtContentInjected) return;
  window.__qbtContentInjected = true;

  // --- cached settings ------------------------------------------------------

  let interceptClicks   = false; // off by default
  let interceptHeadCheck = false;

  browser.storage.local.get({ interceptClicks: false, interceptHeadCheck: false }).then((s) => {
    interceptClicks    = s.interceptClicks;
    interceptHeadCheck = s.interceptHeadCheck;
  });

  browser.storage.onChanged.addListener((changes) => {
    if ("interceptClicks"    in changes) interceptClicks    = changes.interceptClicks.newValue;
    if ("interceptHeadCheck" in changes) interceptHeadCheck = changes.interceptHeadCheck.newValue;
  });

  // --- detection helpers ----------------------------------------------------

  function isMagnet(href) {
    return typeof href === "string" && href.startsWith("magnet:");
  }

  // Patterns that are definitely torrent downloads -- no network check needed.
  function isDefiniteTorrent(href) {
    if (!href || !href.startsWith("http")) return false;
    try {
      const u    = new URL(href);
      const path = u.pathname.toLowerCase();

      if (path.endsWith(".torrent")) return true;
      // Jackett:   /dl/<indexer>/  with jackett_apikey param
      // Prowlarr:  /dl/<id>        with apikey param
      if (path.includes("/dl/") &&
          (u.searchParams.has("jackett_apikey") || u.searchParams.has("apikey"))) return true;
      // file= query param names the file (some indexers)
      if ((u.searchParams.get("file") || "").toLowerCase().endsWith(".torrent")) return true;
    } catch { /* malformed URL */ }
    return false;
  }

  // Candidate for HEAD check: HTTP/HTTPS link that isn't obviously a webpage.
  function mightBeTorrent(href) {
    if (!href || !href.startsWith("http")) return false;
    try {
      const path = new URL(href).pathname.toLowerCase();
      if (path === "/" || path === "") return false;
      if (/\.(html?|php|asp|aspx|jsp|cfm|png|jpe?g|gif|svg|webp|css|js|mjs|xml|json|txt|pdf)$/.test(path)) return false;
      return true;
    } catch { return false; }
  }

  // --- click handler --------------------------------------------------------

  document.addEventListener("click", async (e) => {
    if (!e.isTrusted)      return;
    if (!interceptClicks)  return; // synchronous check, no async gap

    let target = e.target;
    while (target && target.tagName !== "A") target = target.parentElement;
    if (!target) return;

    const href = target.href;
    if (!href) return;

    // Tier 1: magnet URI
    if (isMagnet(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      browser.runtime.sendMessage({ type: "ADD_MAGNET", url: href });
      return;
    }

    // Tier 2: known-safe URL patterns
    if (isDefiniteTorrent(href)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      browser.runtime.sendMessage({ type: "ADD_TORRENT", url: href });
      return;
    }

    // Tier 3: HEAD check for ambiguous links (only if user opted in)
    if (interceptHeadCheck && mightBeTorrent(href)) {
      // Prevent default NOW before the async gap.
      // If it turns out not to be a torrent, background.js opens it normally.
      e.preventDefault();
      e.stopImmediatePropagation();
      const isTorrent = await browser.runtime.sendMessage({ type: "CHECK_URL", url: href });
      if (isTorrent) {
        browser.runtime.sendMessage({ type: "ADD_TORRENT", url: href });
      } else {
        browser.runtime.sendMessage({ type: "OPEN_URL", url: href });
      }
    }
  }, true);

})();
