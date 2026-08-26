#!/usr/bin/env bash
#
# Read-only hosted acceptance for the runtime-to-Factory capability boundary
# (issue #55).
#
# It changes nothing. It runs one short-lived rootless Podman container as the
# App Builder runtime user and asks the only question that matters: from inside
# the isolation a future task attempt will run in, can the Factory's internal
# listener be reached at all?
#
# The repository tests prove the same property under a bare network namespace,
# which is the kernel primitive Podman's --network=none uses. This script is the
# proof that the *hosted* Podman installation is actually configured that way,
# and it is the operator's to run:
#
#   sudo bash ops/hetzner/verify-agent-boundary.sh
#
# It must not be treated as evidence unless it has genuinely been executed on
# the host and its output recorded.
set -euo pipefail

failures=0
RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"
FACTORY_PORT="${APP_BUILDER_SERVICE_PORT:-4310}"
PROBE_IMAGE="${APP_BUILDER_PROBE_IMAGE:-docker.io/library/alpine:3.21}"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }
skip() { printf 'SKIP  %s\n' "$1"; }

as_runtime() {
  runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNTIME_USER")" "$@"
}

printf '== App Builder agent boundary acceptance ==\n'
printf 'host: %s\n' "$(hostname)"
printf 'date: %s\n' "$(date -Is)"

# --- 1. Sandbox mechanism and version ---------------------------------------
if as_runtime podman --version >/dev/null 2>&1; then
  pass "rootless sandbox mechanism: $(as_runtime podman --version)"
else
  fail "rootless podman is callable as ${RUNTIME_USER}"
  printf '\nCannot continue without the sandbox mechanism.\n' >&2
  exit 1
fi
printf 'INFO  rootless: %s\n' "$(as_runtime podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null || echo unknown)"

# --- 2. The Factory listener is loopback-only and alive ---------------------
exposed="$(ss -H -ltn 2>/dev/null | awk -v p=":${FACTORY_PORT}" '$4 ~ p"$" && $4 !~ /^127\.0\.0\.1:/ && $4 !~ /^\[::1\]:/ {print $4}')"
if [[ -z "$exposed" ]]; then
  pass "Factory port ${FACTORY_PORT} is not publicly bound"
else
  fail "Factory port ${FACTORY_PORT} is not publicly bound (found: ${exposed})"
fi

factory_live=0
if curl -fsS --max-time 5 "http://127.0.0.1:${FACTORY_PORT}/health" >/dev/null 2>&1; then
  factory_live=1
  pass "Factory answers /health on host loopback (the isolation result below is therefore meaningful)"
else
  # Without a live listener, "unreachable from the sandbox" proves nothing.
  fail "Factory is answering on 127.0.0.1:${FACTORY_PORT} — start app-builder-factory.service before running this acceptance"
fi

# --- 3. The bypass, attempted from inside the real sandbox ------------------
if (( factory_live == 1 )); then
  gateway_targets=()
  for alias in host.containers.internal host.docker.internal; do gateway_targets+=("${alias}"); done
  for address in $(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'); do gateway_targets+=("${address}"); done

  probe_script='set -e; rc=0
for target in "$@"; do
  if timeout 4 nc -z -w 3 "${target%%|*}" "${target##*|}" 2>/dev/null; then
    echo "REACHED ${target}"; rc=1
  else
    echo "refused ${target}"
  fi
done
echo "--- interfaces ---"; ip -o addr show 2>/dev/null || true
exit $rc'

  targets=("127.0.0.1|${FACTORY_PORT}" "localhost|${FACTORY_PORT}" "::1|${FACTORY_PORT}")
  for target in "${gateway_targets[@]}"; do targets+=("${target}|${FACTORY_PORT}"); done

  printf 'INFO  probing %s from inside --network=none\n' "${targets[*]}"
  if output="$(as_runtime podman run --rm \
      --network=none --pid=private --ipc=private --uts=private --cgroupns=private \
      --security-opt=no-new-privileges --cap-drop=ALL --read-only \
      --memory=256m --pids-limit=64 \
      --entrypoint /bin/sh \
      "$PROBE_IMAGE" -c "$probe_script" -- "${targets[@]}" 2>&1)"; then
    pass "no Factory destination is reachable from inside the task sandbox"
    printf '%s\n' "$output" | sed 's/^/      /'
  else
    if printf '%s' "$output" | grep -q '^REACHED '; then
      fail "a task sandbox reached the Factory control plane"
      printf '%s\n' "$output" | sed 's/^/      /' >&2
    else
      fail "sandbox probe did not run (see output)"
      printf '%s\n' "$output" | sed 's/^/      /' >&2
    fi
  fi

  # The host network namespace must not be silently available.
  if as_runtime podman run --rm --network=none "$PROBE_IMAGE" ip -o addr show 2>/dev/null | grep -vq ' lo '; then
    fail "a --network=none sandbox sees a non-loopback interface"
  else
    pass "a --network=none sandbox sees only loopback"
  fi
fi

# --- 4. No container control socket or Factory state is exposed -------------
for host_path in /run/podman/podman.sock /var/run/podman/podman.sock /var/run/docker.sock /run/docker.sock; do
  if as_runtime podman run --rm --network=none "$PROBE_IMAGE" test -e "$host_path" >/dev/null 2>&1; then
    fail "container control socket ${host_path} is visible inside the sandbox"
  else
    pass "container control socket ${host_path} is not visible inside the sandbox"
  fi
done
for host_path in /srv/app-builder /etc/app-builder; do
  if as_runtime podman run --rm --network=none "$PROBE_IMAGE" test -e "$host_path" >/dev/null 2>&1; then
    fail "${host_path} is visible inside the sandbox"
  else
    pass "${host_path} is not visible inside the sandbox"
  fi
done

# --- 5. The broker socket, when enabled -------------------------------------
broker_socket="$(systemctl show app-builder-factory.service -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^APP_BUILDER_AGENT_BROKER_SOCKET=//p' || true)"
if [[ -n "$broker_socket" && -S "$broker_socket" ]]; then
  mode="$(stat -c '%a' "$broker_socket")"
  owner="$(stat -c '%U' "$broker_socket")"
  if [[ "$mode" == "600" && "$owner" == "$RUNTIME_USER" ]]; then
    pass "agent broker socket is owner-only (${owner}, ${mode})"
  else
    fail "agent broker socket permissions are ${owner}:${mode}, expected ${RUNTIME_USER}:600"
  fi
  if as_runtime podman run --rm --network=none \
      --volume "${broker_socket}:/run/app-builder/broker.sock:rw,Z" \
      "$PROBE_IMAGE" test -S /run/app-builder/broker.sock >/dev/null 2>&1; then
    pass "the mounted broker socket is the sandbox's one Factory reach"
  else
    fail "the broker socket did not mount into the sandbox"
  fi
else
  skip "agent broker is not enabled on this host (set APP_BUILDER_AGENT_BROKER_SOCKET and APP_BUILDER_AGENT_GRANT_SECRET on app-builder-factory.service)"
fi

# --- 6. Nothing else on this shared host changed -----------------------------
opencode_port="$(jq -r '.opencodePort // 4097' /etc/app-builder-host.json 2>/dev/null || echo 4097)"
for port in "$FACTORY_PORT" 4096 "$opencode_port"; do
  exposed="$(ss -H -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" && $4 !~ /^127\.0\.0\.1:/ && $4 !~ /^\[::1\]:/ {print $4}')"
  if [[ -z "$exposed" ]]; then
    pass "port ${port} remains loopback-only"
  else
    fail "port ${port} is publicly bound (found: ${exposed})"
  fi
done

if systemctl show app-builder-factory.service -p Slice --value 2>/dev/null | grep -q 'app-builder-runtime.slice'; then
  pass "factory service remains inside the App Builder resource slice"
else
  skip "factory service slice not reported (unit may not be running)"
fi

printf 'INFO  services not owned by App Builder on this host (must be untouched):\n'
systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null | awk '$1 !~ /^app-builder-/ {print "      " $1}' | head -40

printf '\n'
if (( failures > 0 )); then
  printf 'Agent boundary acceptance FAILED with %d problem(s).\n' "$failures" >&2
  exit 1
fi
printf 'Agent boundary acceptance passed. Record this output as the hosted evidence for issue #55.\n'
