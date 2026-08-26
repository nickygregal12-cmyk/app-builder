#!/usr/bin/env bash
set -euo pipefail

# Install dormant systemd units for the App Builder factory service and
# loopback-only OpenCode server. The units are not enabled or started here.

RUNTIME_USER="appbuilder"
REPO="/srv/app-builder/repository"
ETC_DIR="/etc/app-builder"
OPENCODE_PORT="${APP_BUILDER_OPENCODE_PORT:-4096}"

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

install -d -m 0750 -o root -g "$RUNTIME_USER" "$ETC_DIR"

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

cat > /etc/systemd/system/app-builder-factory.service <<'EOF'
[Unit]
Description=App Builder factory service
After=network-online.target
Wants=network-online.target
ConditionPathExists=/srv/app-builder/repository/package.json

[Service]
Type=simple
User=appbuilder
Group=appbuilder
WorkingDirectory=/srv/app-builder/repository
Environment=HOME=/home/appbuilder
Environment=PATH=/home/appbuilder/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/appbuilder/.local/bin/npm run service
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
ConditionPathExists=/home/appbuilder/.local/bin/opencode
ConditionPathExists=/srv/app-builder/repository/package.json

[Service]
Type=simple
User=appbuilder
Group=appbuilder
WorkingDirectory=/srv/app-builder/repository
Environment=HOME=/home/appbuilder
Environment=PATH=/home/appbuilder/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=${ETC_DIR}/opencode-server.env
ExecStart=/home/appbuilder/.local/bin/opencode serve --hostname 127.0.0.1 --port ${OPENCODE_PORT}
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

systemctl daemon-reload

printf 'Installed dormant App Builder units:\n'
printf '  app-builder-factory.service  (expected loopback factory port 4310)\n'
printf '  app-builder-opencode.service (127.0.0.1:%s)\n' "$OPENCODE_PORT"
printf '\nNeither unit was enabled or started.\n'
printf 'Run verify-host.sh and install repository dependencies before starting either service.\n'
