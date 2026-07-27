# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Firefox/LibreWolf WebExtension (Manifest V2) that sends magnet links and `.torrent` file URLs to a local qBittorrent WebUI via its HTTP API.

Published on AMO (addons.mozilla.org). Extension ID: `push-to-qbittorrent@krulkrul.github`.

## Deploy (LibreWolf Flatpak)

```bash
./deploy.sh           # pack, kill browser, install .xpi, relaunch
./deploy.sh --pack-only   # just rebuild the .xpi
./deploy.sh --no-restart  # pack and install without relaunching
./deploy.sh --watch       # rebuild on file changes
```

The script handles signing bypass (`xpinstall.signatures.required=false`) and HTTPS-only mode (`dom.security.https_only_mode=false`) via `user.js` in the LibreWolf profile.

## Packing manually

```bash
zip -r push-to-qbittorrent.xpi manifest.json background.js content.js popup.html popup.js options.html options.js icons/
```

Install via `about:addons` → gear icon → **Install Add-on From File**.

## File roles

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (MV2, gecko-specific settings) |
| `background.js` | Background page: context menus, qBt API calls, notifications |
| `content.js` | Injected into every page; intercepts magnet/torrent clicks |
| `popup.html/js` | Toolbar button popup: connection status + quick toggles |
| `options.html/js` | Full settings page (URL, credentials, all toggles) |
| `deploy.sh` | Build + install script for LibreWolf Flatpak |
| `make_icons.py` | Regenerates `icons/` from source |

## Settings (storage.local keys)

| Key | Default | Description |
|---|---|---|
| `qbtUrl` | `http://localhost:8080` | qBittorrent WebUI base URL |
| `qbtUsername` | `""` | Login username |
| `qbtPassword` | `""` | Login password |
| `interceptClicks` | `false` | Intercept magnet/torrent link clicks |
| `interceptHeadCheck` | `false` | HEAD request check for ambiguous links |
| `pauseOnAdd` | `false` | Add torrents in paused state |
| `category` | `""` | Default category assigned to added torrents |
| `savePath` | `""` | Override save path on qBittorrent host |
| `showNotifications` | `true` | Desktop notifications on success |

## qBittorrent API used

- `POST /api/v2/auth/login` — session auth (works with empty username/password)
- `GET  /api/v2/app/version` — version check / connection test
- `POST /api/v2/torrents/add` — add by URL/magnet (`urls=`) or file upload (`torrents=` multipart)

**Login success detection is version-dependent and NOT just `resp.ok`:**
- qBittorrent 5.x+: `HTTP 204` with an empty body on success.
- Older qBittorrent: `HTTP 200` with body `"Ok."` on success.
- Wrong credentials, either version: `HTTP 200` with body `"Fails."` — so `resp.ok` alone is not a valid success check, it's `true` even on wrong credentials.

Correct check (used in `background.js`, `options.js`, `popup.js`):
```js
if (resp.status === 204) { /* success */ }
else {
  const text = await resp.text();
  if (resp.ok && text.trim() === "Ok.") { /* success */ }
  else { /* failure: text.trim() || `HTTP ${resp.status}` */ }
}
```

## Key design decisions

- **MV2 not MV3**: LibreWolf ships Firefox engine; MV2 `background.scripts` with `persistent: true` is fully supported and simpler than service workers.
- **Click interception is opt-in**: `content.js` checks `storage.local.interceptClicks` synchronously (cached at load, kept in sync via `storage.onChanged`) before calling `e.preventDefault()` — no async gap.
- **`.torrent` files are proxied**: background script fetches the `.torrent` binary using browser session cookies and re-uploads as `multipart/form-data` to qBt's API. This preserves private tracker auth without exposing cookies to qBittorrent.
- **No external dependencies**: plain ES2020, no bundler needed.
- **All JS must be ASCII-only**: non-ASCII characters (em dashes, ellipsis, box-drawing) cause Firefox to silently fail loading the script.
- **No `content_security_policy` key in manifest**: a custom CSP causes Firefox's auto-generated background page to fail loading `background.js`.
- **Origin header rewrite via `webRequest`**: qBittorrent's WebUI rejects any request whose `Origin` header doesn't match its own host:port ("Origin header & Target origin mismatch"), independent of and not controlled by the CSRF/Host-header-validation toggles in qBittorrent's own settings. `fetch()` from an extension background page always sends the real `moz-extension://` origin, which can't be set or omitted via `fetch()` itself, so `background.js` uses `browser.webRequest.onBeforeSendHeaders` (requires `webRequest` + `webRequestBlocking` permissions) to rewrite `Origin` to match the configured `qbtUrl` for requests going to that host.

## Torrent detection tiers (content.js)

1. `magnet:` URI — immediate, no network
2. Known patterns — `.torrent` extension, Jackett (`/dl/` + `jackett_apikey`), Prowlarr (`/dl/` + `apikey`), `file=*.torrent` query param
3. HEAD request — only when `interceptHeadCheck` is enabled; checks `Content-Type` for `bittorrent`/`x-torrent` or `octet-stream` + `.torrent` in `Content-Disposition`

## Known gotchas

- **`deploy.sh`'s `EXTENSION_ID` must match `manifest.json`'s `browser_specific_settings.gecko.id` exactly.** Firefox sideloads `<profile>/extensions/<id>.xpi` by matching the filename to the ID *inside* the manifest — if they differ, Firefox silently discards the file on startup (no error, it just vanishes from the extensions directory) and keeps running whatever was previously installed under the real ID. This bit us once: `deploy.sh` had a stale `push-to-qbittorrent@local` while the manifest said `push-to-qbittorrent@krulkrul.github`, so every deploy silently no-opped and we spent a while debugging "fixes" that were never actually loaded. If a deploy ever seems to have no effect, check this first before assuming the code change is wrong.
- **Jackett/Prowlarr-style download links are never proxied**, unlike literal `.torrent` URLs. `useProxy` in `background.js` only triggers when the URL ends in `.torrent`; Jackett/Prowlarr `/dl/` links don't, so they're handed to qBittorrent as a raw `urls=` value and qBittorrent fetches them **server-side**. If qBittorrent's host/container has restricted egress (e.g. a VPN-container kill-switch firewall that doesn't allow-list the LAN), those adds fail with a timeout even though magnets and direct `.torrent` files work fine — this is a qBittorrent-host networking issue, not an extension bug. (See the `gluetun_qbittorrent` stack's own `CLAUDE.md` on the NAS for the concrete case: needed `FIREWALL_OUTBOUND_SUBNETS` set to the LAN subnet.)

## Regenerating icons

```bash
python3 make_icons.py
```
