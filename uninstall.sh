#!/usr/bin/env bash
# Reverses what setup.sh did: stops and removes the systemd service, and
# optionally the dedicated system user, firewall rule, and installed files.
# Nothing destructive happens without an explicit confirmation.
#
# Usage:
#   sudo ./uninstall.sh
set -euo pipefail

SERVICE_NAME="opensims"
STATE_DIR="/etc/opensims"
STATE_FILE="$STATE_DIR/install.conf"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; YELLOW=""; RESET=""
fi
info()  { echo "${BOLD}==>${RESET} $*"; }
note()  { echo "${DIM}    $*${RESET}"; }
warn()  { echo "${YELLOW}!!${RESET} $*"; }
fail()  { echo "${RED}Error:${RESET} $*" >&2; exit 1; }

ask_yn() {
  local __var="$1" __question="$2" __default="$3" __reply __hint
  if [ "$__default" = "y" ]; then __hint="Y/n"; else __hint="y/N"; fi
  if [ ! -t 0 ]; then
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

if [ "$(id -u)" -ne 0 ]; then
  fail "This needs root (it removes a systemd service and may remove a system user). Try: sudo ./uninstall.sh"
fi

# ---------- recover install state ----------
INSTALL_DIR=""
PORT=""
SERVICE_USER=""
SERVICE_USER_CREATED="n"
UFW_RULE_ADDED="n"

if [ -f "$STATE_FILE" ]; then
  # shellcheck source=/dev/null
  . "$STATE_FILE"
  note "Loaded install state from $STATE_FILE"
elif [ -f "$UNIT_FILE" ]; then
  warn "No $STATE_FILE found; recovering what I can from the systemd unit."
  INSTALL_DIR="$(sed -n 's/^WorkingDirectory=//p' "$UNIT_FILE" | head -n1)"
  SERVICE_USER="$(sed -n 's/^User=//p' "$UNIT_FILE" | head -n1)"
  PORT="$(sed -n 's/^Environment=PORT=//p' "$UNIT_FILE" | head -n1)"
else
  warn "No install found (no $STATE_FILE, no $UNIT_FILE). Nothing to do for the service."
fi

echo
echo "${BOLD}OpenSims uninstaller${RESET}"
[ -n "$INSTALL_DIR" ]   && note "Install directory : $INSTALL_DIR"
[ -n "$PORT" ]          && note "Port              : $PORT"
[ -n "$SERVICE_USER" ]  && note "Service user      : $SERVICE_USER"
echo

# ---------- stop & remove the service ----------
if systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1 && [ -f "$UNIT_FILE" ]; then
  info "Stopping and disabling ${SERVICE_NAME}..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$UNIT_FILE"
  systemctl daemon-reload || warn "daemon-reload failed, but the unit file is gone — continuing."
  note "Service removed."
else
  note "No systemd service installed; skipping."
fi

# ---------- firewall rule ----------
if [ "$UFW_RULE_ADDED" = "y" ] && [ -n "$PORT" ] && command -v ufw >/dev/null 2>&1; then
  ask_yn REMOVE_UFW "Remove the ufw rule for port ${PORT}/tcp that setup.sh added?" "y"
  if [ "$REMOVE_UFW" = "y" ]; then
    ufw delete allow "${PORT}/tcp" >/dev/null 2>&1 || warn "Couldn't remove the ufw rule (maybe already gone)."
    note "ufw rule removed."
  fi
fi

# ---------- dedicated service user ----------
if [ "$SERVICE_USER_CREATED" = "y" ] && [ -n "$SERVICE_USER" ] && id "$SERVICE_USER" >/dev/null 2>&1; then
  ask_yn REMOVE_USER "Remove the dedicated system user '${SERVICE_USER}' that setup.sh created?" "y"
  if [ "$REMOVE_USER" = "y" ]; then
    userdel "$SERVICE_USER" 2>/dev/null || warn "Couldn't remove user '$SERVICE_USER'."
    note "User removed."
  fi
fi

# ---------- installed files ----------
if [ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ]; then
  echo
  warn "This will permanently delete: $INSTALL_DIR"
  ask_yn REMOVE_FILES "Delete the installed app directory too?" "n"
  if [ "$REMOVE_FILES" = "y" ]; then
    rm -rf "$INSTALL_DIR"
    note "Removed $INSTALL_DIR."
  else
    note "Left in place: $INSTALL_DIR"
  fi
fi

rm -rf "$STATE_DIR"

echo
info "Done."
