#!/usr/bin/env bash
set -euo pipefail

# Install dormant systemd units for the App Builder factory service and
# loopback-only OpenCode server. The units are not enabled or started here.

RUNTIME_USER="appbuilder"
REPO="/srv/app-builder/repository"
ETC_DIR="/etc/app-builder"
STATE_ROOT="/srv/app-builder/state/service"
WORKSPACES_ROOT="/srv/app-builder/workspaces"
OPENCODE_PORT="${APP_BUILDER_OPENCODE_PORT:-4097}"
BROKER_SOCKET="/srv/app-builder/runtime/agent-broker.sock"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root or through sudo." >&2
  exit 1
fi

if [[ ! -f /etc/app-builder-host.json ]] || ! grep -q 'app-builder-runtime-colocated' /etc/app-builder-host.json; then
  echo "App Builder co-location baseline is not installed. Run install-existing-host.sh first." >&2
  exit 1
fi

if ! id "$RUNTIME_USER" >/dev/null 2>&1; then
  echo "Runtime user '$RUNTIME_USER' is missing." >&2
  exit 1
fi

if [[ ! -d "$REPO" ]]; then
  echo "Repository directory $REPO is missing." >&2
  exit 1
fi

if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${OPENCODE_PORT}$"; then
  echo "Port ${OPENCODE_PORT} is already in use. Set APP_BUILDER_OPENCODE_PORT to a free loopback port before installing the unit." >&2
  exit 1
fi

install -d -m 0750 -o root -g "$RUNTIME_USER" "$ETC_DIR"
install -d -m 0750 -o "$RUNTIME_USER" -g "$RUNTIME_USER" "$STATE_ROOT" "$WORKSPACES_ROOT"

# Generate a local-only OpenCode HTTP password. This is not a model/provider
# secret; it protects the loopback API from unrelated local users/processes.
# Preserve an existing value on repeat installs.
if [[ ! -s "$ETC_DIR/opencode-server.env" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    password="$(openssl rand -hex 32)"
  else
    password="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | tr '/+' '_-')"
  fi
  cat > "$ETC_DIR/opencode-server.env" <<EOF
OPENCODE_SERVER_USERNAME=appbuilder-runtime
OPENCODE_SERVER_PASSWORD=${password}
EOF
  chown root:"$RUNTIME_USER" "$ETC_DIR/opencode-server.env"
  chmod 0640 "$ETC_DIR/opencode-server.env"
fi

# Agent capability broker (issue #55). Opt-in, because a broker is only a
# boundary when the operator has decided a task runtime exists to bound: until
# then it would be one more thing listening. It binds a Unix socket under the
# runtime directory, never a port, so enabling it exposes nothing new to the
# network and nothing at all to the rest of this shared host.
BROKER_ENV_LINES=""
if [[ "${APP_BUILDER_ENABLE_AGENT_BROKER:-0}" == "1" ]]; then
  # The signing key never leaves the factory process. It is not a provider
  # credential and must not be reused as one. Preserved across repeat installs
  # so already-issued grants stay verifiable.
  if [[ ! -s "$ETC_DIR/agent-broker.env" ]]; then
    if command -v openssl >/dev/null 2>&1; then
      grant_secret="$(openssl rand -hex 48)"
    else
      grant_secret="$(head -c 64 /dev/urandom | base64 | tr -d '\n' | tr '/+' '_-')"
    fi
    cat > "$ETC_DIR/agent-broker.env" <<BROKER
APP_BUILDER_AGENT_BROKER_SOCKET=${BROKER_SOCKET}
APP_BUILDER_AGENT_GRANT_SECRET=${grant_secret}
BROKER
    chown root:"$RUNTIME_USER" "$ETC_DIR/agent-broker.env"
    chmod 0640 "$ETC_DIR/agent-broker.env"
  fi
  install -d -m 0700 -o "$RUNTIME_USER" -g "$RUNTIME_USER" "$(dirname "$BROKER_SOCKET")"
  BROKER_ENV_LINES="EnvironmentFile=${ETC_DIR}/agent-broker.env"
fi

cat > /etc/systemd/system/app-builder-factory.service <<EOF
[Unit]
Description=App Builder factory service
After=network-online.target
Wants=network-online.target
ConditionPathExists=${REPO}/package.json

[Service]
Type=simple
User=${RUNTIME_USER}
Group=${RUNTIME_USER}
WorkingDirectory=${REPO}
Environment=HOME=/home/${RUNTIME_USER}
Environment=PATH=/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=APP_BUILDER_SERVICE_HOST=127.0.0.1
Environment=APP_BUILDER_SERVICE_PORT=4310
Environment=APP_BUILDER_STATE_ROOT=${STATE_ROOT}
Environment=APP_BUILDER_WORKSPACES_ROOT=${WORKSPACES_ROOT}
${BROKER_ENV_LINES}
ExecStart=/home/${RUNTIME_USER}/.local/bin/npm run service
Restart=on-failure
RestartSec=5s
Slice=app-builder-runtime.slice
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/app-builder-opencode.service <<EOF
[Unit]
Description=App Builder loopback OpenCode server
After=network-online.target
Wants=network-online.target
ConditionPathExists=/home/${RUNTIME_USER}/.local/bin/opencode
ConditionPathExists=${REPO}/package.json

[Service]
Type=simple
User=${RUNTIME_USER}
Group=${RUNTIME_USER}
WorkingDirectory=${REPO}
Environment=HOME=/home/${RUNTIME_USER}
Environment=PATH=/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${ETC_DIR}/opencode-server.env
ExecStart=/home/${RUNTIME_USER}/.local/bin/opencode serve --hostname 127.0.0.1 --port ${OPENCODE_PORT}
Restart=on-failure
RestartSec=5s
Slice=app-builder-runtime.slice
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

# Record the selected local port and durable service paths in the existing host
# marker for later verification and AgentRuntimeAdapter discovery.
tmp_marker="$(mktemp)"
jq \
  --argjson port "$OPENCODE_PORT" \
  --arg stateRoot "$STATE_ROOT" \
  --arg workspacesRoot "$WORKSPACES_ROOT" \
  '.opencodePort = $port | .serviceStateRoot = $stateRoot | .serviceWorkspacesRoot = $workspacesRoot' \
  /etc/app-builder-host.json > "$tmp_marker"
install -m 0644 -o root -g root "$tmp_marker" /etc/app-builder-host.json
rm -f "$tmp_marker"

systemctl daemon-reload

printf 'Installed dormant App Builder units:\n'
printf '  app-builder-factory.service  (127.0.0.1:4310)\n'
printf '    state: %s\n' "$STATE_ROOT"
printf '    workspaces: %s\n' "$WORKSPACES_ROOT"
printf '  app-builder-opencode.service (127.0.0.1:%s)\n' "$OPENCODE_PORT"
if [[ -n "$BROKER_ENV_LINES" ]]; then
  printf '  agent capability broker: %s (Unix socket, no port)\n' "$BROKER_SOCKET"
else
  printf '  agent capability broker: disabled (set APP_BUILDER_ENABLE_AGENT_BROKER=1 to install it)\n'
fi
printf '\nNeither unit was enabled or started.\n'
printf 'Run verify-host.sh and install repository dependencies before starting either service.\n'
