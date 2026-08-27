#!/usr/bin/env bash
#
# Create the bounded public-egress network for task attempts.
#
#   sudo bash ops/hetzner/install-egress-network.sh
#
# `network=none` is the default and the proven profile. A few roles — research,
# brand research, source ingestion — have policies that genuinely allow
# `network.public`, and this is the only way they get it.
#
# Public egress must not mean host-network access. Three things make that true,
# and all three matter:
#
#   1. the attempt gets its own network namespace on a named bridge, never the
#      host's, and never a network it can choose;
#   2. rootless Podman's slirp4netns/pasta layer does not map the host's
#      loopback into the rootless network namespace, so `127.0.0.1:4310` is not
#      routable from the attempt whatever else is reachable;
#   3. an nftables ruleset inside the rootless network namespace drops every
#      private, link-local, metadata, unique-local and carrier-grade-NAT
#      destination, and the host's own global addresses.
#
# The third is the one that needs care in rootless mode. The rootless network
# namespace exists only while a container using a netavark network is running;
# when the last one exits it is torn down and the ruleset goes with it. So this
# script also installs an anchor unit — one idle container on the network —
# whose only job is to keep that namespace, and the ruleset, alive.
#
# This script changes nothing about the Factory, the broker or any existing
# service, and it does not enable the profile. `ops/hetzner/verify-egress-profile.sh`
# is what proves the filter works and writes the attestation; until that
# attestation exists the Podman driver refuses `public-egress-only` rather than
# falling back to an unfiltered network.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
RUNTIME_UID="$(id -u "$RUNTIME_USER")"
RUNTIME_DIR="/run/user/${RUNTIME_UID}"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"
NETWORK="${APP_BUILDER_EGRESS_NETWORK:-app-builder-egress}"
SUBNET="${APP_BUILDER_EGRESS_SUBNET:-10.89.240.0/24}"
ANCHOR_IMAGE="${APP_BUILDER_ANCHOR_IMAGE:-docker.io/library/alpine:3.21}"
RULES="/etc/app-builder/egress.nft"
ATTESTATION="${APP_BUILDER_EGRESS_ATTESTATION_FILE:-/etc/app-builder/egress-profile.json}"

as_runtime() {
  ( cd /tmp && runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" XDG_RUNTIME_DIR="$RUNTIME_DIR" "$@" )
}

printf '== App Builder egress network install ==\n'
printf 'host: %s\ndate: %s\n\n' "$(hostname)" "$(date -Is)"

# Reconfiguring any part of the egress profile invalidates the previous proof.
# Do this before even checking prerequisites so a failed or interrupted install
# cannot leave an older attestation authorising a network state we just tried to
# replace. Only a later passing verifier may restore durable evidence.
rm -f "$ATTESTATION"

as_runtime podman --version >/dev/null 2>&1 || { printf 'FAIL  rootless podman is not callable as %s\n' "$RUNTIME_USER" >&2; exit 1; }

# --- 1. The bounded network -------------------------------------------------
if as_runtime podman network exists "$NETWORK"; then
  printf 'INFO  network %s already exists; leaving it as it is\n' "$NETWORK"
else
  # `isolate=true` stops this network reaching any other Podman network on the
  # host, so an attempt cannot address a neighbouring runtime's containers.
  as_runtime podman network create \
    --driver bridge \
    --subnet "$SUBNET" \
    --opt isolate=true \
    "$NETWORK"
  printf 'PASS  created %s on %s\n' "$NETWORK" "$SUBNET"
fi

# --- 2. The egress filter ---------------------------------------------------
install -d -m 0755 /etc/app-builder
cat > "$RULES" <<'NFT'
# Egress filter for App Builder task attempts.
#
# Applied inside the rootless network namespace, where the attempt's traffic is
# forwarded. Default accept on the chain with explicit drops, rather than
# default drop, because this namespace also carries the runtime's own DNS and
# NAT and a blanket drop would break the profile it is meant to bound.
#
# Every destination below is one the control plane's egress policy classifies
# as forbidden. Keep the two in step: packages/control-plane/src/egress-policy.js
# generates the verifier's probe list from the same set.
table inet app_builder_egress {
  set forbidden4 {
    type ipv4_addr
    flags interval
    elements = {
      0.0.0.0/8,
      10.0.0.0/8,
      100.64.0.0/10,
      127.0.0.0/8,
      169.254.0.0/16,
      172.16.0.0/12,
      192.0.0.0/24,
      192.168.0.0/16,
      198.18.0.0/15,
      224.0.0.0/4,
      240.0.0.0/4
    }
  }
  set forbidden6 {
    type ipv6_addr
    flags interval
    elements = {
      ::1/128,
      ::/128,
      fc00::/7,
      fe80::/10,
      ff00::/8
    }
  }
  chain forward {
    type filter hook forward priority filter; policy accept;
    ip daddr @forbidden4 counter drop
    ip6 daddr @forbidden6 counter drop
  }
  chain output {
    type filter hook output priority filter; policy accept;
    ip daddr @forbidden4 counter drop
    ip6 daddr @forbidden6 counter drop
  }
}
NFT

# The host's own global addresses are public addresses and still off limits:
# reaching the factory host from its own sandbox is the bypass, whichever
# address it wears. Build the dynamic lines in Python from argv so shell command
# substitution cannot strip the final newline and fuse the last rule to `}`.
host_addresses=()
while IFS= read -r address; do
  [[ -n "$address" ]] && host_addresses+=("$address")
done < <(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}')

if (( ${#host_addresses[@]} > 0 )); then
  printf 'INFO  dropping the host'"'"'s own global addresses: %s\n' "${host_addresses[*]}"
  python3 - "$RULES" "${host_addresses[@]}" <<'PY'
import sys

path = sys.argv[1]
addresses = sys.argv[2:]
text = open(path).read()
needle = "    ip6 daddr @forbidden6 counter drop\n"
extra = "".join(f"    ip daddr {address} counter drop\n" for address in addresses)
text = text.replace(needle, needle + extra)
open(path, "w").write(text)
PY
fi
chmod 0644 "$RULES"
printf 'PASS  wrote %s\n' "$RULES"

# --- 3. The anchor that keeps the namespace, and the rules, alive ------------
cat > /etc/systemd/system/app-builder-egress-anchor.service <<UNIT
[Unit]
Description=App Builder egress network anchor (keeps the rootless network namespace and its egress filter alive)
After=network-online.target user-runtime-dir@${RUNTIME_UID}.service
Wants=network-online.target
Requires=user-runtime-dir@${RUNTIME_UID}.service

[Service]
Type=simple
User=${RUNTIME_USER}
Slice=app-builder-runtime.slice
Environment=HOME=/home/${RUNTIME_USER}
Environment=PATH=${RUNTIME_PATH}
Environment=XDG_RUNTIME_DIR=${RUNTIME_DIR}
WorkingDirectory=/tmp
ExecStartPre=-/usr/bin/podman rm --force app-builder-egress-anchor
ExecStart=/usr/bin/podman run --rm --name app-builder-egress-anchor \
  --network=${NETWORK} --pid=private --ipc=private --uts=private --cgroupns=private \
  --security-opt=no-new-privileges --cap-drop=ALL --read-only --memory=64m --pids-limit=16 \
  ${ANCHOR_IMAGE} sleep infinity
ExecStartPost=/bin/sh -c 'sleep 2; /usr/bin/podman unshare --rootless-netns /usr/sbin/nft -f ${RULES}'
ExecStop=-/usr/bin/podman stop --time 5 app-builder-egress-anchor
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
printf 'PASS  wrote /etc/systemd/system/app-builder-egress-anchor.service\n'

printf '\nInstalled, and deliberately not started. Next, in order:\n\n'
printf '  sudo systemctl daemon-reload\n'
printf '  sudo systemctl enable --now app-builder-egress-anchor.service\n'
printf '  sudo bash ops/hetzner/verify-egress-profile.sh\n\n'
printf 'The profile stays unusable until the verifier passes: with no attestation the\n'
printf 'Podman driver refuses public-egress-only rather than falling back to an\n'
printf 'unfiltered network.\n'
