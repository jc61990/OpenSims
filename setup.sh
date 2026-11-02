#!/usr/bin/env bash
# Interactive installer for OpenSims: builds the app and installs it as a
# systemd service that starts on boot and restarts if it crashes.
#
# Usage:
#   sudo ./setup.sh            # interactive
#   sudo ./setup.sh -y         # accept every default, no prompts
#
# Safe to re-run: re-running updates an existing install in place (rebuilds,
# rewrites the service file, restarts the service) rather than failing.
set -euo pipefail

SERVICE_NAME="opensims"
STATE_DIR="/etc/opensims"
STATE_FILE="$STATE_DIR/install.conf"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NODESOURCE_MAJOR="22"
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      echo "Usage: sudo ./setup.sh [-y|--yes]"
      echo "  -y, --yes   Accept every default without prompting."
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# ---------- output helpers ----------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; YELLOW=""; RESET=""
fi
info()  { echo "${BOLD}==>${RESET} $*"; }
note()  { echo "${DIM}    $*${RESET}"; }
warn()  { echo "${YELLOW}!!${RESET} $*"; }
fail()  { echo "${RED}Error:${RESET} $*" >&2; exit 1; }

# ---------- prompt helpers ----------
# ask VAR "Question" "default"   — interactive text prompt, or the default
# when -y was passed or stdin isn't a terminal.
ask() {
  local __var="$1" __question="$2" __default="$3" __reply
  if [ "$ASSUME_YES" = "1" ] || [ ! -t 0 ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  read -r -p "${BOLD}?${RESET} ${__question} ${DIM}[${__default}]${RESET} " __reply || true
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

# ask_yn VAR "Question" "y"|"n"  — interactive yes/no prompt; VAR is set to
# "y" or "n".
ask_yn() {
  local __var="$1" __question="$2" __default="$3" __reply __hint
  if [ "$__default" = "y" ]; then __hint="Y/n"; else __hint="y/N"; fi
  if [ "$ASSUME_YES" = "1" ] || [ ! -t 0 ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  while true; do
    read -r -p "${BOLD}?${RESET} ${__question} ${DIM}[${__hint}]${RESET} " __reply || true
    __reply="${__reply:-$__default}"
    case "$__reply" in
      [Yy]*) printf -v "$__var" 'y'; return ;;
      [Nn]*) printf -v "$__var" 'n'; return ;;
      *) echo "Please answer y or n." ;;
    esac
  done
}

# ---------- sanity checks ----------
if [ "$(id -u)" -ne 0 ]; then
  fail "This installer needs root (it creates a system user, a systemd service, and may install packages). Try: sudo ./setup.sh"
fi

if ! command -v apt-get >/dev/null 2>&1; then
  fail "No apt-get found — this installer only supports Debian/Ubuntu-family systems."
fi

if ! command -v systemctl >/dev/null 2>&1; then
  fail "No systemctl found — this installer needs systemd to manage the service."
fi

if ! command -v rsync >/dev/null 2>&1; then
  info "Installing rsync (needed to copy the app into place)..."
  apt-get install -y rsync >/dev/null 2>&1 || { apt-get update && apt-get install -y rsync; }
fi

if [ -r /etc/os-release ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  note "Detected OS: ${PRETTY_NAME:-unknown}"
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$REPO_DIR/package.json" ] || [ ! -f "$REPO_DIR/scripts/serve.mjs" ]; then
  fail "setup.sh must be run from inside the OpenSims repo (couldn't find package.json / scripts/serve.mjs next to it)."
fi

echo
echo "${BOLD}OpenSims installer${RESET}"
echo "This will build the app and install it as a systemd service."
echo

# ---------- gather settings ----------
DEFAULT_INSTALL_DIR="/opt/opensims"
ask INSTALL_DIR "Install directory" "$DEFAULT_INSTALL_DIR"
INSTALL_DIR="${INSTALL_DIR%/}"
[ -n "$INSTALL_DIR" ] || fail "Install directory can't be empty."

ask PORT "Port to serve the game on" "8080"
case "$PORT" in
  ''|*[!0-9]*) fail "Port must be a number." ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  fail "Port must be between 1 and 65535."
fi

ask_yn USE_DEDICATED_USER "Run the service as a new, unprivileged system user named '${SERVICE_NAME}' (recommended)?" "y"
if [ "$USE_DEDICATED_USER" = "y" ]; then
  SERVICE_USER="$SERVICE_NAME"
else
  ask SERVICE_USER "Existing username to run the service as" "${SUDO_USER:-root}"
  id "$SERVICE_USER" >/dev/null 2>&1 || fail "User '$SERVICE_USER' doesn't exist."
fi

INSTALL_NODE="n"
if command -v node >/dev/null 2>&1; then
  CURRENT_NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
  CURRENT_NODE_MINOR="$(node -e 'console.log(process.versions.node.split(".")[1])')"
  note "Found Node.js $(node -v)"
  # Mirrors vite's own engines requirement: ^20.19.0 || >=22.12.0.
  NODE_OK="n"
  if [ "$CURRENT_NODE_MAJOR" -gt 22 ] || { [ "$CURRENT_NODE_MAJOR" -eq 22 ] && [ "$CURRENT_NODE_MINOR" -ge 12 ]; }; then
    NODE_OK="y"
  elif [ "$CURRENT_NODE_MAJOR" -eq 20 ] && [ "$CURRENT_NODE_MINOR" -ge 19 ]; then
    NODE_OK="y"
  fi
  if [ "$NODE_OK" = "n" ]; then
    warn "That's older than this project wants (Node 20.19+ or 22.12+)."
    ask_yn INSTALL_NODE "Install Node.js ${NODESOURCE_MAJOR}.x LTS from NodeSource now (replaces the current one)?" "y"
  fi
else
  warn "Node.js not found."
  ask_yn INSTALL_NODE "Install Node.js ${NODESOURCE_MAJOR}.x LTS from NodeSource now?" "y"
  [ "$INSTALL_NODE" = "y" ] || fail "Node.js is required to build and run OpenSims. Install it yourself and re-run setup.sh."
fi

UFW_AVAILABLE="n"
OPEN_FIREWALL="n"
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  UFW_AVAILABLE="y"
  ask_yn OPEN_FIREWALL "ufw is active — open port ${PORT}/tcp through it?" "y"
fi

ask_yn ENABLE_ON_BOOT "Start OpenSims automatically on boot?" "y"
ask_yn START_NOW "Start the OpenSims service now, once installed?" "y"

echo
info "Summary"
note "Install directory : $INSTALL_DIR"
note "Port              : $PORT"
note "Service user      : $SERVICE_USER $( [ "$USE_DEDICATED_USER" = "y" ] && echo "(new, dedicated, no login)" )"
note "Install Node.js   : $( [ "$INSTALL_NODE" = "y" ] && echo "yes (NodeSource ${NODESOURCE_MAJOR}.x)" || echo "no" )"
if [ "$UFW_AVAILABLE" = "y" ]; then
  note "Open in ufw       : $OPEN_FIREWALL"
fi
note "Start on boot     : $ENABLE_ON_BOOT"
note "Start now         : $START_NOW"
echo
ask_yn PROCEED "Proceed with install?" "y"
[ "$PROCEED" = "y" ] || { echo "Aborted."; exit 0; }
echo

# ---------- install Node.js, if requested ----------
if [ "$INSTALL_NODE" = "y" ]; then
  info "Installing Node.js ${NODESOURCE_MAJOR}.x from NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODESOURCE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  note "Now on $(node -v)"
fi

command -v node >/dev/null 2>&1 || fail "Node.js still isn't on PATH — install it manually and re-run setup.sh."
command -v npm  >/dev/null 2>&1 || fail "npm still isn't on PATH — install it manually and re-run setup.sh."
NODE_BIN="$(command -v node)"

# ---------- copy the app into place ----------
mkdir -p "$INSTALL_DIR"
if [ "$INSTALL_DIR" != "$REPO_DIR" ]; then
  info "Copying app into $INSTALL_DIR..."
  # node_modules/dist are rebuilt fresh below; no need to carry over a
  # possibly stale or foreign-architecture copy from wherever this repo was
  # checked out.
  rsync -a --delete \
    --exclude node_modules \
    --exclude dist \
    --exclude .git \
    "$REPO_DIR"/ "$INSTALL_DIR"/
else
  note "Installing in place at $INSTALL_DIR"
fi

# ---------- build ----------
info "Installing dependencies..."
( cd "$INSTALL_DIR" && if [ -f package-lock.json ]; then npm ci; else npm install; fi )

info "Building production bundle..."
( cd "$INSTALL_DIR" && npm run build )

[ -f "$INSTALL_DIR/dist/index.html" ] || fail "Build didn't produce dist/index.html — something went wrong above."

# ---------- service user ----------
if [ "$USE_DEDICATED_USER" = "y" ] && ! id "$SERVICE_USER" >/dev/null 2>&1; then
  info "Creating system user '${SERVICE_USER}'..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  SERVICE_USER_CREATED="y"
else
  SERVICE_USER_CREATED="n"
fi

# The service only ever reads dist/ and scripts/serve.mjs — it never writes
# anything (all game state lives in the player's browser), so it's enough to
# make those world-readable rather than changing ownership of the whole tree.
chmod o+rx "$INSTALL_DIR"
chmod -R a+rX "$INSTALL_DIR/dist" "$INSTALL_DIR/scripts"

# ---------- systemd unit ----------
info "Writing systemd service..."
EXTRA_CAPABILITIES=""
if [ "$PORT" -lt 1024 ]; then
  # Binding a port below 1024 normally needs root; grant just that one
  # capability instead of running the whole service as root.
  EXTRA_CAPABILITIES=$'AmbientCapabilities=CAP_NET_BIND_SERVICE\nCapabilityBoundingSet=CAP_NET_BIND_SERVICE'
fi

cat > "$UNIT_FILE" <<EOF
[Unit]
Description=OpenSims game server
After=network.target
Documentation=https://github.com/jc61990/OpenSims

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${PORT}
Environment=HOST=0.0.0.0
ExecStart=${NODE_BIN} ${INSTALL_DIR}/scripts/serve.mjs
Restart=on-failure
RestartSec=3
${EXTRA_CAPABILITIES}

# Hardening — the server is read-only (no DB, no writes, state lives in the
# browser), so it needs no write access of its own anywhere.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# ---------- firewall ----------
if [ "$OPEN_FIREWALL" = "y" ]; then
  info "Opening port ${PORT}/tcp in ufw..."
  ufw allow "${PORT}/tcp" >/dev/null
fi

# ---------- enable / start ----------
if [ "$ENABLE_ON_BOOT" = "y" ]; then
  systemctl enable "$SERVICE_NAME" >/dev/null
  note "Enabled: will start automatically on boot."
else
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
fi

if [ "$START_NOW" = "y" ]; then
  info "Starting ${SERVICE_NAME}..."
  systemctl restart "$SERVICE_NAME"
  sleep 1
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    note "Running."
  else
    warn "Service didn't come up cleanly — check: journalctl -u ${SERVICE_NAME} -n 50"
  fi
fi

# ---------- save install state for uninstall.sh ----------
mkdir -p "$STATE_DIR"
cat > "$STATE_FILE" <<EOF
INSTALL_DIR=${INSTALL_DIR}
PORT=${PORT}
SERVICE_USER=${SERVICE_USER}
SERVICE_USER_CREATED=${SERVICE_USER_CREATED}
UFW_RULE_ADDED=${OPEN_FIREWALL}
EOF

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
info "Done."
echo "  URL             : http://${SERVER_IP:-<this-server>}:${PORT}/"
echo "  Status          : systemctl status ${SERVICE_NAME}"
echo "  Logs            : journalctl -u ${SERVICE_NAME} -f"
echo "  Stop            : systemctl stop ${SERVICE_NAME}"
echo "  Start           : systemctl start ${SERVICE_NAME}"
echo "  Restart         : systemctl restart ${SERVICE_NAME}"
echo "  Update & rebuild: re-run this script (sudo ./setup.sh) after a 'git pull' in ${INSTALL_DIR}"
echo "  Uninstall       : sudo ${INSTALL_DIR}/uninstall.sh"
echo
