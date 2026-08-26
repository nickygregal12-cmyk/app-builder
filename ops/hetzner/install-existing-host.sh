#!/usr/bin/env bash
set -euo pipefail

# Prepare an existing Hetzner host for a co-located App Builder runtime without
# changing the host's SSH policy, firewall, existing Node installation, or
# project-specific services.

RUNTIME_USER="appbuilder"
BASE="/srv/app-builder"
NODE_VERSION="${APP_BUILDER_NODE_VERSION:-22.23.2}"
CPU_QUOTA="${APP_BUILDER_CPU_QUOTA:-150%}"
MEMORY_HIGH="${APP_BUILDER_MEMORY_HIGH:-25%}"
MEMORY_MAX="${APP_BUILDER_MEMORY_MAX:-35%}"
TASKS_MAX="${APP_BUILDER_TASKS_MAX:-1024}"
SUBID_COUNT=65536
SUBID_MIN=100000

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root or through sudo." >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required for the shared-host isolation profile." >&2
  exit 1
fi

if [[ -n "${APP_BUILDER_NODE_ARCH:-}" ]]; then
  NODE_ARCH="$APP_BUILDER_NODE_ARCH"
else
  case "$(uname -m)" in
    x86_64|amd64) NODE_ARCH="x64" ;;
    aarch64|arm64) NODE_ARCH="arm64" ;;
    *)
      echo "Unsupported host architecture $(uname -m); set APP_BUILDER_NODE_ARCH explicitly if Node publishes a matching build." >&2
      exit 1
      ;;
  esac
fi

# Refuse to take over an unrelated pre-existing account with the same name.
if id "$RUNTIME_USER" >/dev/null 2>&1 && ! grep -q 'app-builder-runtime-colocated' /etc/app-builder-host.json 2>/dev/null; then
  echo "User '$RUNTIME_USER' already exists but is not recorded as an App Builder runtime identity. Refusing to modify it." >&2
  exit 1
fi

# Refuse to take over an unrelated filesystem tree.
if [[ -e "$BASE" ]] && ! grep -q 'app-builder-runtime-colocated' /etc/app-builder-host.json 2>/dev/null; then
  echo "$BASE already exists but is not recorded as App Builder-managed. Refusing to modify it." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  fuse-overlayfs \
  git \
  jq \
  podman \
  ripgrep \
  slirp4netns \
  sqlite3 \
  uidmap \
  xz-utils

if ! id "$RUNTIME_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$RUNTIME_USER"
fi
passwd -l "$RUNTIME_USER" >/dev/null 2>&1 || true

# Runtime account is deliberately not granted sudo and receives no inbound SSH key.
rm -f "/home/${RUNTIME_USER}/.ssh/authorized_keys"

install -d -m 0750 -o "$RUNTIME_USER" -g "$RUNTIME_USER" \
  "$BASE" \
  "$BASE/repository" \
  "$BASE/runtime" \
  "$BASE/workspaces" \
  "$BASE/state" \
  "$BASE/checkpoints" \
  "$BASE/logs" \
  "$BASE/artifacts" \
  "/home/${RUNTIME_USER}/.local/bin" \
  "/home/${RUNTIME_USER}/.local/lib"

# Install Node for App Builder only. Do not replace /usr/bin/node or
# /usr/local/bin/node because an existing project on this host may depend on a
# different version.
NODE_ROOT="/opt/app-builder/node/v${NODE_VERSION}-${NODE_ARCH}"
NODE_TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
if [[ ! -x "$NODE_ROOT/bin/node" ]]; then
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  cd "$tmpdir"
  curl --fail --silent --show-error --location --remote-name "${NODE_BASE_URL}/${NODE_TARBALL}"
  curl --fail --silent --show-error --location --remote-name "${NODE_BASE_URL}/SHASUMS256.txt"
  grep " ${NODE_TARBALL}$" SHASUMS256.txt | sha256sum --check --strict -
  install -d /opt/app-builder/node
  tar -xJf "$NODE_TARBALL" -C /opt/app-builder/node
  mv "/opt/app-builder/node/node-v${NODE_VERSION}-linux-${NODE_ARCH}" "$NODE_ROOT"
  rm -rf "$tmpdir"
  trap - EXIT
fi

for binary in node npm npx corepack; do
  ln -sfn "$NODE_ROOT/bin/$binary" "/home/${RUNTIME_USER}/.local/bin/$binary"
done
chown -R "$RUNTIME_USER:$RUNTIME_USER" "/home/${RUNTIME_USER}/.local"

touch "/home/${RUNTIME_USER}/.profile"
if ! grep -Fq 'export PATH="$HOME/.local/bin:$PATH"' "/home/${RUNTIME_USER}/.profile"; then
  printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> "/home/${RUNTIME_USER}/.profile"
fi
chown "$RUNTIME_USER:$RUNTIME_USER" "/home/${RUNTIME_USER}/.profile"

# Rootless container prerequisites for the future ExecutionEnvironmentAdapter.
# useradd normally allocates subordinate IDs automatically on Ubuntu. If it did
# not, allocate a fresh range *after* all ranges already present on the host so
# App Builder cannot overlap another runtime user (for example Predictor).
next_subid_start() {
  local file="$1"
  local max_end
  max_end="$(awk -F: 'NF >= 3 { end = ($2 + 0) + ($3 + 0); if (end > max) max = end } END { print max + 0 }' "$file" 2>/dev/null || echo 0)"
  if (( max_end < SUBID_MIN )); then
    printf '%d\n' "$SUBID_MIN"
  else
    printf '%d\n' "$max_end"
  fi
}

if ! grep -q "^${RUNTIME_USER}:" /etc/subuid; then
  subuid_start="$(next_subid_start /etc/subuid)"
  subuid_end=$((subuid_start + SUBID_COUNT - 1))
  usermod --add-subuids "${subuid_start}-${subuid_end}" "$RUNTIME_USER"
fi
if ! grep -q "^${RUNTIME_USER}:" /etc/subgid; then
  subgid_start="$(next_subid_start /etc/subgid)"
  subgid_end=$((subgid_start + SUBID_COUNT - 1))
  usermod --add-subgids "${subgid_start}-${subgid_end}" "$RUNTIME_USER"
fi
loginctl enable-linger "$RUNTIME_USER" || true

# App Builder workloads should run inside this slice so they cannot consume the
# whole shared server. The defaults are conservative and can be overridden when
# running this installer, e.g. APP_BUILDER_CPU_QUOTA=250%.
cat > /etc/systemd/system/app-builder-runtime.slice <<EOF
[Unit]
Description=Resource limits for co-located App Builder runtime

[Slice]
CPUAccounting=yes
MemoryAccounting=yes
TasksAccounting=yes
CPUQuota=${CPU_QUOTA}
MemoryHigh=${MEMORY_HIGH}
MemoryMax=${MEMORY_MAX}
TasksMax=${TASKS_MAX}
EOF

# Helper for future service/runtime commands. Nothing is started automatically.
cat > /usr/local/sbin/app-builder-run <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$#" -eq 0 ]]; then
  echo "Usage: app-builder-run COMMAND [ARGS...]" >&2
  exit 2
fi
exec systemd-run \
  --quiet \
  --wait \
  --collect \
  --uid=appbuilder \
  --gid=appbuilder \
  --slice=app-builder-runtime.slice \
  --property=WorkingDirectory=/srv/app-builder/runtime \
  --setenv=HOME=/home/appbuilder \
  --setenv=PATH=/home/appbuilder/.local/bin:/usr/local/bin:/usr/bin:/bin \
  "$@"
EOF
chmod 0755 /usr/local/sbin/app-builder-run

systemctl daemon-reload

cat > /etc/app-builder-host.json <<EOF
{
  "schemaVersion": 1,
  "role": "app-builder-runtime-colocated",
  "nodeVersion": "${NODE_VERSION}",
  "nodeArch": "${NODE_ARCH}",
  "runtimeUser": "${RUNTIME_USER}",
  "baseDirectory": "${BASE}",
  "resourceSlice": "app-builder-runtime.slice",
  "cpuQuota": "${CPU_QUOTA}",
  "memoryHigh": "${MEMORY_HIGH}",
  "memoryMax": "${MEMORY_MAX}",
  "tasksMax": "${TASKS_MAX}",
  "hostSshModified": false,
  "hostFirewallModified": false,
  "globalNodeModified": false,
  "autonomousRuntimeEnabled": false,
  "providerSecretsInstalled": false
}
EOF
chmod 0644 /etc/app-builder-host.json

printf '\nApp Builder shared-host baseline installed.\n'
printf 'Existing SSH, firewall, global Node and project services were left unchanged.\n'
printf 'Runtime user: %s (locked, non-sudo, no authorized SSH key)\n' "$RUNTIME_USER"
printf 'Node: %s (%s), isolated under /opt/app-builder\n' "$NODE_VERSION" "$NODE_ARCH"
printf 'Resource slice: CPU %s, memory high %s, memory max %s, tasks %s\n' "$CPU_QUOTA" "$MEMORY_HIGH" "$MEMORY_MAX" "$TASKS_MAX"
printf 'No App Builder service, OpenCode session, or autonomous loop was started.\n'
