#!/usr/bin/env bash
#
# Hosted acceptance for the public-egress task profile.
#
#   sudo bash ops/hetzner/verify-egress-profile.sh
#
# `ops/hetzner/verify-agent-boundary.sh` proves the `none` profile: an attempt
# with no network at all cannot reach the Factory. This proves the harder one.
# A role whose policy allows `network.public` gets the public internet, and
# "public" has to exclude the Factory control plane, host loopback, the host's
# own addresses, every private range, link-local, cloud metadata and the
# carrier-grade-NAT range where Tailscale addresses live.
#
# It proves that by connecting from inside a real `--network=app-builder-egress`
# container, not by reading configuration. The probe list is generated from
# `packages/control-plane/src/egress-policy.js`, so the shell and the control
# plane cannot disagree about what must not be reachable.
#
# On success it writes /etc/app-builder/egress-profile.json. The Podman
# execution driver requires that attestation and refuses the profile without a
# recent one, so an untested or lapsed filter fails closed rather than
# quietly becoming an unfiltered network.
#
# It starts nothing and enables nothing. Run install-egress-network.sh first.
set -euo pipefail

failures=0
RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPOSITORY="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
NETWORK="${APP_BUILDER_EGRESS_NETWORK:-app-builder-egress}"
PROBE_IMAGE="${APP_BUILDER_PROBE_IMAGE:-docker.io/library/alpine:3.21}"
FACTORY_PORT="${APP_BUILDER_SERVICE_PORT:-4310}"
ATTESTATION="${APP_BUILDER_EGRESS_ATTESTATION_FILE:-/etc/app-builder/egress-profile.json}"
MAX_AGE_DAYS="${APP_BUILDER_EGRESS_ATTESTATION_DAYS:-30}"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

as_runtime() {
  ( cd /tmp && runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNTIME_USER")" "$@" )
}

printf '== App Builder public-egress profile acceptance ==\n'
printf 'host: %s\ndate: %s\nnetwork: %s\n\n' "$(hostname)" "$(date -Is)" "$NETWORK"

# Every verification attempt supersedes the previous proof. Remove it before
# any prerequisite check so an early exit (missing Podman/network, dead Factory,
# or an unavailable policy generator) cannot leave stale evidence usable. Only
# this verifier's all-probes-passed path may write the attestation back.
rm -f "$ATTESTATION"

as_runtime podman --version >/dev/null 2>&1 || { printf 'FAIL  rootless podman is not callable as %s\n' "$RUNTIME_USER" >&2; exit 1; }

if as_runtime podman network exists "$NETWORK"; then
  pass "the bounded egress network ${NETWORK} exists"
else
  fail "the bounded egress network ${NETWORK} does not exist — run ops/hetzner/install-egress-network.sh"
  printf '\nCannot continue without the network.\n' >&2
  exit 1
fi

# The Factory must be live, or "unreachable from the sandbox" is a statement
# about a dead port rather than about the filter.
if curl -fsS --max-time 5 "http://127.0.0.1:${FACTORY_PORT}/health" >/dev/null 2>&1; then
  pass "Factory answers /health on host loopback (the refusals below are therefore meaningful)"
else
  fail "Factory is not answering on 127.0.0.1:${FACTORY_PORT} — start app-builder-factory.service before running this acceptance"
  printf '\nCannot continue without a live listener to fail to reach.\n' >&2
  exit 1
fi

# The probe list comes from the control plane, not from this file.
targets_json="$(cd "$REPOSITORY" && node --input-type=module -e '
import os from "node:os";
import { forbiddenEgressProbeTargets } from "@app-builder/control-plane/egress-policy";
const hostAddresses = Object.values(os.networkInterfaces()).flat().filter((entry) => entry && !entry.internal && entry.family === "IPv4").map((entry) => entry.address);
process.stdout.write(JSON.stringify(forbiddenEgressProbeTargets({ hostAddresses, factoryPort: Number(process.env.APP_BUILDER_SERVICE_PORT ?? 4310) })));
' 2>/dev/null || echo '')"
if [[ -z "$targets_json" ]]; then
  fail "could not generate the forbidden-destination list from the control plane at ${REPOSITORY}"
  printf '\nRefusing to fall back to a hand-written list: it would drift from what the code enforces.\n' >&2
  exit 1
fi
mapfile -t targets < <(printf '%s' "$targets_json" | jq -r '.[] | "\(.host)|\(.port)|\(.why)"')
pass "generated ${#targets[@]} forbidden destination(s) from the control-plane egress policy"

probe_script='rc=0
for spec in "$@"; do
  host="${spec%%|*}"; rest="${spec#*|}"; port="${rest%%|*}"; why="${rest#*|}"
  if timeout 4 nc -z -w 3 "$host" "$port" 2>/dev/null; then
    echo "REACHED ${host}:${port} (${why})"; rc=1
  else
    echo "refused  ${host}:${port} (${why})"
  fi
done
exit $rc'

printf '\nINFO  probing forbidden destinations from inside --network=%s\n' "$NETWORK"
if output="$(as_runtime podman run --rm \
    --network="$NETWORK" --pid=private --ipc=private --uts=private --cgroupns=private \
    --security-opt=no-new-privileges --cap-drop=ALL --read-only \
    --memory=256m --pids-limit=64 \
    --entrypoint /bin/sh \
    "$PROBE_IMAGE" -c "$probe_script" -- "${targets[@]}" 2>&1)"; then
  pass "no forbidden destination is reachable from a public-egress attempt"
  printf '%s\n' "$output" | sed 's/^/      /'
else
  if printf '%s' "$output" | grep -q '^REACHED '; then
    fail "a public-egress attempt reached a forbidden destination"
  else
    fail "egress probe did not run (see output)"
  fi
  printf '%s\n' "$output" | sed 's/^/      /' >&2
fi

# A profile that reaches nothing is not the profile. A role that was granted the
# public internet has to actually get it, or the boundary has silently become
# `none` and nobody will notice until a research role produces nothing.
if as_runtime podman run --rm --network="$NETWORK" --security-opt=no-new-privileges --cap-drop=ALL --read-only \
    --entrypoint /bin/sh "$PROBE_IMAGE" -c 'timeout 8 nslookup example.com >/dev/null 2>&1' >/dev/null 2>&1; then
  pass "public DNS resolves from a public-egress attempt"
else
  fail "public DNS does not resolve — the egress profile reaches nothing and is not a public-egress profile"
fi
if as_runtime podman run --rm --network="$NETWORK" --security-opt=no-new-privileges --cap-drop=ALL --read-only \
    --entrypoint /bin/sh "$PROBE_IMAGE" -c 'timeout 10 nc -z -w 8 example.com 443' >/dev/null 2>&1; then
  pass "public HTTPS is reachable from a public-egress attempt"
else
  fail "public HTTPS is not reachable — the egress profile reaches nothing"
fi

# The rest of the boundary must be unchanged by this profile.
if as_runtime podman run --rm --network="$NETWORK" "$PROBE_IMAGE" test -e /srv/app-builder >/dev/null 2>&1; then
  fail "/srv/app-builder is visible inside a public-egress attempt"
else
  pass "/srv/app-builder is not visible inside a public-egress attempt"
fi
for host_path in /run/podman/podman.sock /var/run/docker.sock; do
  if as_runtime podman run --rm --network="$NETWORK" "$PROBE_IMAGE" test -e "$host_path" >/dev/null 2>&1; then
    fail "container control socket ${host_path} is visible inside a public-egress attempt"
  else
    pass "container control socket ${host_path} is not visible inside a public-egress attempt"
  fi
done

printf '\n'
if (( failures > 0 )); then
  printf 'Public-egress profile acceptance FAILED with %d problem(s). The attestation was not written,\n' "$failures" >&2
  printf 'so the execution driver will keep refusing the public-egress-only profile.\n' >&2
  exit 1
fi

install -d -m 0755 "$(dirname "$ATTESTATION")"
cat > "$ATTESTATION" <<JSON
{
  "schemaVersion": 1,
  "result": "passed",
  "network": "${NETWORK}",
  "host": "$(hostname)",
  "verifiedAt": "$(date -Is)",
  "maxAgeDays": ${MAX_AGE_DAYS},
  "factoryPort": ${FACTORY_PORT},
  "forbiddenDestinations": ${#targets[@]},
  "verifier": "ops/hetzner/verify-egress-profile.sh",
  "note": "Written only by a passing run of the verifier. Every install or verification attempt invalidates older evidence first, and the Podman execution driver refuses public-egress-only without a recent attestation."
}
JSON
chmod 0644 "$ATTESTATION"
printf 'Public-egress profile acceptance passed. Attestation written to %s (valid %s days).\n' "$ATTESTATION" "$MAX_AGE_DAYS"
printf 'Re-run this verifier after any change to the network, the nftables ruleset or the host addresses.\n'
