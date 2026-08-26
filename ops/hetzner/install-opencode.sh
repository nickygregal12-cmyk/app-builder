#!/usr/bin/env bash
set -euo pipefail

# Install the OpenCode runtime binary for the unprivileged appbuilder account.
# This does NOT configure provider credentials, start a daemon, or enable
# autonomous execution. AgentRuntimeAdapter remains the control boundary.

VERSION="${OPENCODE_VERSION:-1.18.14}"
RUNTIME_USER="appbuilder"
PREFIX="/home/${RUNTIME_USER}/.local"
RUNTIME_PATH="${PREFIX}/bin:/usr/local/bin:/usr/bin:/bin"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root or through sudo." >&2
  exit 1
fi

if ! id "$RUNTIME_USER" >/dev/null 2>&1; then
  echo "The appbuilder runtime user does not exist; run install-existing-host.sh first." >&2
  exit 1
fi

if ! runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" npm --version >/dev/null 2>&1; then
  echo "App Builder's isolated npm is unavailable; run install-existing-host.sh first." >&2
  exit 1
fi

install -d -m 0750 -o "$RUNTIME_USER" -g "$RUNTIME_USER" "$PREFIX" "$PREFIX/bin" "$PREFIX/lib"

runuser -u "$RUNTIME_USER" -- env \
  HOME="/home/${RUNTIME_USER}" \
  PATH="$RUNTIME_PATH" \
  npm_config_prefix="$PREFIX" \
  npm install --global --no-audit --no-fund "opencode-ai@${VERSION}"

installed="$({ runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" opencode --version || true; } 2>&1)"
if [[ -z "$installed" ]]; then
  echo "OpenCode installation did not produce a callable binary." >&2
  exit 1
fi

printf 'Installed OpenCode %s for %s (requested version %s).\n' "$installed" "$RUNTIME_USER" "$VERSION"
printf 'No provider/API credentials were configured and no autonomous service was started.\n'
