# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Firefox/LibreWolf WebExtension (Manifest V2) that sends magnet links and `.torrent` file URLs to a local qBittorrent WebUI via its HTTP API.

Target qBittorrent instance: `http://192.168.2.6:8181` (no password).

## Loading the extension in LibreWolf / Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this directory

For permanent installation, pack it first (see below).

## Packing

```bash
cd /home/krul/src/push-to-qbittorrent
zip -r push-to-qbittorrent.xpi manifest.json background.js content.js popup.html popup.js options.html options.js icons/
```

Then install via `about:addons` → gear icon → **Install Add-on From File**.

## File roles

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (MV2, gecko-specific settings) |
| `background.js` | Background page: context menus, qBt API calls, notifications |
| `content.js` | Injected into every page; intercepts magnet/torrent clicks |
| `popup.html/js` | Toolbar button popup: status + quick toggles |
| `options.html/js` | Full settings page (URL, credentials, toggles) |

## qBittorrent API used

- `POST /api/v2/auth/login` — session auth (works with empty username/password)
- `GET  /api/v2/app/version` — version check / connection test
- `POST /api/v2/torrents/add` — add by URL/magnet (`urls=`) or file upload (`torrents=` multipart)
- `POST /api/v2/torrents/delete` — remove a torrent

## Key design decisions

- **MV2 not MV3**: LibreWolf ships Firefox engine; MV2 `background.scripts` with `persistent: false` is fully supported and simpler than service workers.
- **Click interception is optional**: `content.js` checks `storage.local.interceptClicks` before eating the click, so users who prefer OS handling can disable it while still having context-menu support.
- **`.torrent` files are proxied**: the background script fetches the `.torrent` binary and re-uploads it as `multipart/form-data` to qBt's API, avoiding the need for the extension to have a "downloads" permission.
- **No external dependencies**: plain ES2020, no bundler needed.

## Regenerating icons

```bash
python3 make_icons.py
```
