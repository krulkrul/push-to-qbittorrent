/**
 * background.js - persistent background page (MV2, Firefox/LibreWolf)
 * Uses browser.menus (Firefox-native).
 */

console.log("[push-to-qbt] background.js loading");

const DEFAULT_SETTINGS = {
  qbtUrl: "http://localhost:8080",
  qbtUsername: "",
  qbtPassword: "",
  // Click interception
  interceptClicks: false,
  interceptHeadCheck: false,
  // Torrent add options
  pauseOnAdd: false,
  category: "",
  savePath: "",
  // UX
  showNotifications: true,
};

function getSettings() {
  return browser.storage.local.get(DEFAULT_SETTINGS);
}

// --- context menus ----------------------------------------------------------

async function buildMenus() {
  try { await browser.menus.removeAll(); } catch (e) { /* ignore */ }
  browser.menus.create({ id: "qbt-link",      title: "Send to qBittorrent", contexts: ["link"] });
  browser.menus.create({ id: "qbt-selection", title: "Send selected magnet to qBittorrent", contexts: ["selection"] });
  console.log("[push-to-qbt] context menus registered");
}

browser.runtime.onInstalled.addListener(buildMenus);
browser.runtime.onStartup.addListener(buildMenus);
buildMenus();

// --- context-menu click handler ---------------------------------------------

browser.menus.onClicked.addListener(async (info) => {
  const settings = await getSettings();
  if (info.menuItemId === "qbt-link") {
    const url = (info.linkUrl || "").trim();
    if (url) await addToQbt(url, settings);
  } else if (info.menuItemId === "qbt-selection") {
    const text = (info.selectionText || "").trim();
    if (text.startsWith("magnet:")) {
      await addToQbt(text, settings);
    } else {
      notify("Not a magnet link", "Selected text is not a magnet URI.", settings, true);
    }
  }
});

// --- messages from content.js -----------------------------------------------

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ADD_MAGNET" || msg.type === "ADD_TORRENT") {
    return getSettings().then((s) => addToQbt(msg.url, s));
  }
  if (msg.type === "CHECK_URL") {
    return isTorrentUrl(msg.url); // Promise<bool>
  }
  if (msg.type === "OPEN_URL") {
    browser.tabs.create({ url: msg.url });
  }
});

// --- HEAD check -------------------------------------------------------------

async function isTorrentUrl(url) {
  try {
    const resp = await fetch(url, { method: "HEAD" });
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    const cd = (resp.headers.get("content-disposition") || "").toLowerCase();
    if (ct.includes("bittorrent") || ct.includes("x-torrent")) return true;
    if (ct.includes("octet-stream") && cd.includes(".torrent")) return true;
    return false;
  } catch (e) {
    console.warn("[push-to-qbt] HEAD check failed:", e.message);
    return false;
  }
}

// --- qBittorrent API --------------------------------------------------------

async function qbtLogin(settings) {
  if (!settings.qbtUrl) {
    throw new Error("qBittorrent URL not configured. Open the extension settings.");
  }
  const base = settings.qbtUrl.replace(/\/$/, "");
  let resp;
  try {
    resp = await fetch(`${base}/api/v2/auth/login`, {
      method: "POST",
      body: new URLSearchParams({
        username: settings.qbtUsername,
        password: settings.qbtPassword,
      }),
      credentials: "include",
    });
  } catch (e) {
    throw new Error(`Cannot reach qBittorrent at ${settings.qbtUrl}: ${e.message}`);
  }
  const text = await resp.text();
  if (text.trim() !== "Ok.") throw new Error(`qBittorrent login failed: ${text.trim()}`);
}

function buildAddParams(settings) {
  const p = new URLSearchParams();
  if (settings.pauseOnAdd) p.set("paused", "true");
  if (settings.category)   p.set("category", settings.category);
  if (settings.savePath)   p.set("savepath", settings.savePath);
  return p;
}

async function addToQbt(url, settings) {
  console.log("[push-to-qbt] addToQbt:", url.slice(0, 80));
  const base = (settings.qbtUrl || "").replace(/\/$/, "");

  // .torrent extension: proxy through browser (preserves session cookies for
  // private trackers). Everything else: hand the URL directly to qBittorrent.
  const useProxy = url.startsWith("http") && /\.torrent(\?|$)/i.test(url);
  const label = url.startsWith("magnet:") ? "Magnet added" : "Torrent added";

  try {
    await qbtLogin(settings);
    const addUrl = `${base}/api/v2/torrents/add`;

    if (useProxy) {
      let torrentResp;
      try {
        torrentResp = await fetch(url, { credentials: "include" });
      } catch (e) {
        throw new Error(`Failed to fetch .torrent file: ${e.message}`);
      }
      if (!torrentResp.ok) throw new Error(`HTTP ${torrentResp.status} fetching .torrent`);
      const blob = await torrentResp.blob();
      const fd = new FormData();
      fd.append("torrents", blob, "file.torrent");
      buildAddParams(settings).forEach((v, k) => fd.append(k, v));
      const resp = await fetch(addUrl, { method: "POST", body: fd, credentials: "include" });
      const text = await resp.text();
      if (text.trim() !== "Ok.") throw new Error(`qBittorrent API: ${text.trim()}`);
    } else {
      const body = buildAddParams(settings);
      body.set("urls", url);
      const resp = await fetch(addUrl, { method: "POST", body, credentials: "include" });
      const text = await resp.text();
      if (text.trim() !== "Ok.") throw new Error(`qBittorrent API: ${text.trim()}`);
    }

    const shortUrl = url.length > 80 ? url.slice(0, 77) + "..." : url;
    notify(label, shortUrl, settings);
    console.log("[push-to-qbt] added:", url.slice(0, 80));
  } catch (e) {
    notify("Failed to add torrent", e.message, settings, true);
    console.error("[push-to-qbt] error:", e);
  }
}

// --- notifications ----------------------------------------------------------

function notify(title, message, settings, isError = false) {
  if (!settings.showNotifications && !isError) return;
  browser.notifications.create({
    type: "basic",
    iconUrl: "icons/icon96.png",
    title,
    message,
  });
}

console.log("[push-to-qbt] background.js ready");
