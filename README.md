# Push to qBittorrent

A Firefox/LibreWolf browser extension that sends magnet links and `.torrent` files directly to your qBittorrent WebUI — via right-click menu or a single click.

## Features

- **Right-click any link** → "Send to qBittorrent" (works on magnets, `.torrent` URLs, Jackett/Prowlarr download links, and anything else)
- **Single-click interception** — magnet and torrent links go straight to qBittorrent without a download dialog (configurable, on by default)
- **Smart detection** for links without a `.torrent` extension: performs a HEAD request and checks the `Content-Type` header
- **Private tracker support** — `.torrent` URLs are proxied through the extension using your browser session cookies, so sites that require a login work correctly
- **Jackett and Prowlarr** download links detected instantly (no HEAD request needed)
- **Desktop notifications** on success and failure
- **Add torrents paused** option

## Installation

### Stable release (recommended)

1. Download `push-to-qbittorrent.xpi` from the [latest release](https://github.com/krulkrul/push-to-qbittorrent/releases/latest)
2. Open Firefox/LibreWolf → `about:addons` → gear icon → **Install Add-on From File...**
3. Select the `.xpi` file
4. Click the extension icon and open **Settings** to enter your qBittorrent WebUI URL

> **LibreWolf Flatpak users**: see [LibreWolf Flatpak notes](#librewolf-flatpak-notes) below.

### Development (from source)

```bash
git clone https://github.com/krulkrul/push-to-qbittorrent
cd push-to-qbittorrent
./deploy.sh
```

## Configuration

Click the extension icon → **Settings**:

| Setting | Default | Description |
|---|---|---|
| qBittorrent WebUI URL | `http://localhost:8080` | Full URL including port |
| Username | *(empty)* | Leave blank if authentication is disabled |
| Password | *(empty)* | Leave blank if authentication is disabled |
| Intercept link clicks | enabled | Single-click sends links to qBittorrent |
| Add torrents paused | disabled | Torrents start in paused state |
| Show notifications | enabled | Desktop notification on success |

## Usage

**Right-click any torrent link** and choose **"Send to qBittorrent"**. This works on:
- `magnet:` links
- Direct `.torrent` file links
- Jackett/Prowlarr download links (detected by `jackett_apikey` / `apikey` URL parameter)
- Any other link — the extension does a HEAD check to verify it serves a `.torrent` file

**Single-click** on a magnet or torrent link is intercepted automatically (disable in settings if you prefer to use a different torrent client for some sites).

**Right-click selected text** containing a magnet URI → "Send selected magnet to qBittorrent".

## LibreWolf Flatpak notes

LibreWolf as a Flatpak has two quirks:

**1. Cannot load temporary extensions via `about:debugging`**

The Flatpak file-chooser portal only grants access to the single file you select (`manifest.json`), not the full extension directory. Extension files like `background.js` become inaccessible. Use the `.xpi` install method instead.

**2. HTTPS-only mode blocks HTTP qBittorrent connections**

LibreWolf enables HTTPS-only mode by default. If your qBittorrent WebUI is on `http://`, the extension's background page fetch will silently upgrade to `https://` and fail with `NetworkError`. The `deploy.sh` script sets `dom.security.https_only_mode = false` in your profile's `user.js` to fix this. You can also set it manually in `about:config`.

### deploy.sh

A deployment helper is included for LibreWolf Flatpak users:

```bash
./deploy.sh              # pack .xpi, fix profile prefs, kill LibreWolf, install, relaunch
./deploy.sh --no-restart # pack + install, restart LibreWolf yourself
./deploy.sh --pack-only  # just build push-to-qbittorrent.xpi
./deploy.sh --watch      # rebuild + reinstall + restart on every file change
                         # (requires inotify-tools: sudo apt install inotify-tools)
```

The script auto-detects the LibreWolf Flatpak profile under `~/.var/app/io.gitlab.librewolf-community/`.

## Compatibility

| Browser | Status |
|---|---|
| Firefox 109+ | Supported |
| LibreWolf (all versions) | Supported |
| Firefox ESR 115+ | Supported |
| Chrome / Edge / Brave | Not supported (uses Firefox-only `browser.menus` API and Manifest V2) |

Requires **qBittorrent 4.1+** (Web API v2).

## Known Limitations & Planned Improvements

- **Firefox only** — uses `browser.menus` which is a Firefox-native API. Chrome requires Manifest V3 and `chrome.contextMenus`. A Chrome-compatible version would need a MV3 rewrite with the [webextension-polyfill](https://github.com/mozilla/webextension-polyfill).
- **Manifest V2** — Firefox still fully supports MV2; Chrome is phasing it out. A future MV3 migration would also enable Chrome/Edge support.
- **No category selection on add** — torrent category/save path could be set from the context menu (would need a sub-menu or a small popup dialog).
- **Single qBittorrent instance** — the settings support one server; multi-server profiles would be useful for power users.
- **HTTPS-only mode** — disabling it globally is a blunt fix. A future improvement would be to add a per-origin exception via `permissions.sqlite` instead.
- **Session expiry** — the extension logs in before every add. A smarter approach would be to attempt the add first, re-login only on auth failure.

## Development

```bash
# Lint
npx web-ext lint

# Pack only
./deploy.sh --pack-only

# Regenerate icons (requires Pillow: pip install pillow)
python3 make_icons.py
```

### File overview

| File | Role |
|---|---|
| `manifest.json` | Extension manifest (MV2) |
| `background.js` | Background page: menus, qBt API calls, notifications |
| `content.js` | Injected into pages: click interception |
| `popup.html/js/css` | Toolbar button popup |
| `options.html/js/css` | Full settings page |
| `deploy.sh` | LibreWolf Flatpak deploy helper |
| `make_icons.py` | Regenerate PNG icons |

## Credits

Inspired by the [Add Link to qBittorrent WebUI!](https://addons.mozilla.org/en-US/firefox/addon/add-link-to-qbittorrent-webui/) Firefox extension. This project was built from scratch using native Firefox WebExtension APIs to work correctly under LibreWolf with Flatpak sandboxing.

## License

MIT — see [LICENSE](LICENSE)
