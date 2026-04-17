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

## Key design decisions

- **MV2 not MV3**: LibreWolf ships Firefox engine; MV2 `background.scripts` with `persistent: true` is fully supported and simpler than service workers.
- **Click interception is opt-in**: `content.js` checks `storage.local.interceptClicks` synchronously (cached at load, kept in sync via `storage.onChanged`) before calling `e.preventDefault()` — no async gap.
- **`.torrent` files are proxied**: background script fetches the `.torrent` binary using browser session cookies and re-uploads as `multipart/form-data` to qBt's API. This preserves private tracker auth without exposing cookies to qBittorrent.
- **No external dependencies**: plain ES2020, no bundler needed.
- **All JS must be ASCII-only**: non-ASCII characters (em dashes, ellipsis, box-drawing) cause Firefox to silently fail loading the script.
- **No `content_security_policy` key in manifest**: a custom CSP causes Firefox's auto-generated background page to fail loading `background.js`.

## Torrent detection tiers (content.js)

1. `magnet:` URI — immediate, no network
2. Known patterns — `.torrent` extension, Jackett (`/dl/` + `jackett_apikey`), Prowlarr (`/dl/` + `apikey`), `file=*.torrent` query param
3. HEAD request — only when `interceptHeadCheck` is enabled; checks `Content-Type` for `bittorrent`/`x-torrent` or `octet-stream` + `.torrent` in `Content-Disposition`

## Regenerating icons

```bash
python3 make_icons.py
```
