#!/usr/bin/env bash
# deploy.sh - Pack and deploy the extension to LibreWolf (Flatpak)
#
# Usage:
#   ./deploy.sh              pack + install + restart LibreWolf
#   ./deploy.sh --no-restart pack + install, skip restart
#   ./deploy.sh --watch      auto-redeploy on file changes (requires inotifywait)
#   ./deploy.sh --pack-only  just build the .xpi, don't install

set -euo pipefail

EXTENSION_ID="push-to-qbittorrent@local"
FLATPAK_APP="io.gitlab.librewolf-community"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
XPI="$BASE_DIR/push-to-qbittorrent.xpi"

PACK_FILES=(
    manifest.json
    background.js content.js
    popup.html popup.js popup.css
    options.html options.js options.css
    icons/
)

# Dirs/files that trigger a redeploy in --watch mode
WATCH_PATHS=(
    manifest.json background.js content.js
    popup.html popup.js popup.css
    options.html options.js options.css
    icons
)

# ── helpers ───────────────────────────────────────────────────────────────────

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "[deploy] $*"; }

# ── find profile ──────────────────────────────────────────────────────────────

find_profile() {
    local bases=(
        "$HOME/.var/app/$FLATPAK_APP/.librewolf"
        "$HOME/.librewolf"
        "$HOME/.mozilla/librewolf"
    )
    for base in "${bases[@]}"; do
        local ini="$base/profiles.ini"
        [[ -f "$ini" ]] || continue

        # Prefer the Install section default (last-used profile)
        local p
        p=$(grep -A2 '^\[Install' "$ini" | grep '^Default=' | head -1 | cut -d= -f2)
        if [[ -n "$p" && -d "$base/$p" ]]; then echo "$base/$p"; return; fi

        # Fall back to Profile section with Default=1
        p=$(python3 - "$base" "$ini" <<'PY'
import sys, configparser
base, ini = sys.argv[1], sys.argv[2]
p = configparser.ConfigParser()
p.read(ini)
for s in p.sections():
    if s.startswith('Profile') and p.get(s, 'Default', fallback='') == '1':
        path = p.get(s, 'Path', '')
        is_rel = p.get(s, 'IsRelative', fallback='1')
        print(base + '/' + path if is_rel == '1' else path)
        break
PY
        )
        if [[ -n "$p" && -d "$p" ]]; then echo "$p"; return; fi
    done
}

# ── allow unsigned extensions via user.js ────────────────────────────────────

ensure_profile_prefs() {
    local profile="$1"
    local userjs="$profile/user.js"
    touch "$userjs"

    # Each entry: "pref.name" "value (as it appears in user_pref())" "comment"
    # Value must be valid JS literal: false, true, or "quoted string"
    local -A PREFS=(
        ["xpinstall.signatures.required"]="false"
        ["dom.security.https_only_mode"]="false"
    )
    local -A COMMENTS=(
        ["xpinstall.signatures.required"]="allow unsigned local extension"
        ["dom.security.https_only_mode"]="allow HTTP fetch to local qBittorrent (https_only would upgrade to https:// and fail)"
    )

    python3 - "$userjs" <<PYEOF
import re, sys
path = sys.argv[1]
content = open(path).read() if __import__('os').path.exists(path) else ''

prefs = {
$(for k in "${!PREFS[@]}"; do echo "    '$k': '${PREFS[$k]}',"; done)
}
comments = {
$(for k in "${!COMMENTS[@]}"; do echo "    '$k': '${COMMENTS[$k]}',"; done)
}

for key, val in prefs.items():
    pref_line = f'user_pref("{key}", {val});'
    comment_line = f'// {comments.get(key, "")}'
    if re.search(re.escape(key), content):
        content = re.sub(r'(?:// [^\n]*\n)?.*' + re.escape(key) + r'.*\n?', '', content)
    content = content.rstrip('\n') + '\n' + comment_line + '\n' + pref_line + '\n'

open(path, 'w').write(content)
PYEOF
    info "user.js updated (signatures + https_only_mode)"
}

# ── pack .xpi ────────────────────────────────────────────────────────────────

pack() {
    info "Packing..."
    cd "$BASE_DIR"
    rm -f "$XPI"
    zip -qr "$XPI" "${PACK_FILES[@]}"
    info "Built: $(basename "$XPI") ($(du -h "$XPI" | cut -f1))"
}

# ── install into profile ──────────────────────────────────────────────────────

install_to_profile() {
    local profile="$1"
    local dest="$profile/extensions/$EXTENSION_ID.xpi"
    mkdir -p "$profile/extensions"
    cp "$XPI" "$dest"
    info "Installed: $dest"
}

# ── LibreWolf process control ─────────────────────────────────────────────────

librewolf_running() {
    pgrep -f "/app/lib/librewolf/librewolf" > /dev/null 2>&1 || \
    pgrep -x librewolf > /dev/null 2>&1
}

kill_librewolf() {
    if librewolf_running; then
        info "Stopping LibreWolf..."
        flatpak kill "$FLATPAK_APP" 2>/dev/null || true
        pkill -f "/app/lib/librewolf/librewolf" 2>/dev/null || true
        pkill -x librewolf 2>/dev/null || true
        local i=0
        while librewolf_running && (( i++ < 40 )); do sleep 0.25; done
        info "Stopped."
    fi
}

start_librewolf() {
    info "Starting LibreWolf..."
    if command -v flatpak &>/dev/null && flatpak list --app 2>/dev/null | grep -q "$FLATPAK_APP"; then
        flatpak run "$FLATPAK_APP" &>/dev/null &
    elif command -v librewolf &>/dev/null; then
        librewolf &>/dev/null &
    else
        info "Could not find LibreWolf binary to start. Launch it manually."
        return
    fi
    disown
    info "Launched."
}

# ── full deploy cycle ─────────────────────────────────────────────────────────

deploy() {
    local restart="$1"

    pack

    local profile
    profile=$(find_profile)
    [[ -n "$profile" ]] || die "LibreWolf profile not found. Run LibreWolf at least once."
    info "Profile: $profile"

    ensure_profile_prefs "$profile"

    if [[ "$restart" == "true" ]]; then
        kill_librewolf
    fi

    install_to_profile "$profile"

    if [[ "$restart" == "true" ]]; then
        start_librewolf
        info "Done — extension updated and LibreWolf restarted."
    else
        info "Done — restart LibreWolf to apply changes."
    fi
}

# ── watch mode ────────────────────────────────────────────────────────────────

watch_mode() {
    command -v inotifywait &>/dev/null || die "'inotifywait' not found. Install inotify-tools: sudo apt install inotify-tools"
    info "Watch mode — monitoring for changes. Ctrl+C to stop."
    deploy true
    while inotifywait -qq -r -e close_write,moved_to,create "${WATCH_PATHS[@]}" 2>/dev/null; do
        info "Change detected, redeploying..."
        sleep 0.3   # debounce
        deploy true
    done
}

# ── argument parsing ──────────────────────────────────────────────────────────

MODE=deploy
RESTART=true

for arg in "$@"; do
    case "$arg" in
        --no-restart) RESTART=false ;;
        --watch)      MODE=watch ;;
        --pack-only)  MODE=pack ;;
        --help|-h)
            cat <<EOF
Usage: $(basename "$0") [options]

  (no options)   Pack the .xpi, install to LibreWolf profile, restart LibreWolf
  --no-restart   Pack + install but don't restart LibreWolf
  --pack-only    Just build push-to-qbittorrent.xpi, don't install
  --watch        Rebuild + reinstall + restart whenever source files change
                 (requires inotify-tools)
  --help         Show this help
EOF
            exit 0 ;;
        *) die "Unknown option: $arg" ;;
    esac
done

cd "$BASE_DIR"

case "$MODE" in
    deploy)   deploy "$RESTART" ;;
    pack)     pack ;;
    watch)    watch_mode ;;
esac
