#!/usr/bin/env bash
#
# Read-only hosted acceptance for the runtime-to-Factory capability boundary
# (issue #55).
#
# It changes nothing. It runs the exact digest-pinned task image declared in
# config/task-images.json as the App Builder runtime user and asks the only
# question that matters: from inside the isolation a future task attempt will
# run in, can the Factory's internal listener be reached at all?
#
# The repository tests prove the same property under a bare network namespace,
# which is the kernel primitive Podman's --network=none uses. This script is the
# proof that the *hosted* Podman installation and the *reviewed task image* are
# actually configured that way, and it is the operator's to run:
#
#   sudo bash ops/hetzner/verify-agent-boundary.sh
#
# It must not be treated as durable evidence merely because the command exists.
# `ops/hetzner/attest-agent-boundary.sh` is the separate fail-closed wrapper that
# records a passing run for the model-canary preflight.
set -euo pipefail

failures=0
RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPOSITORY="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
FACTORY_PORT="${APP_BUILDER_SERVICE_PORT:-4310}"
IMAGE_ID="${APP_BUILDER_TASK_IMAGE_ID:-task-baseline}"
EXPECTED_IMAGE_DIGEST="${APP_BUILDER_EXPECTED_TASK_IMAGE_DIGEST:-}"
BROKER_ENV_FILE="/etc/app-builder/agent-broker.env"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }
skip() { printf 'SKIP  %s\n' "$1"; }

as_runtime() {
  # The operator commonly invokes this script from /home/predictor, which the
  # isolated appbuilder user must not be able to traverse. Use a neutral working
  # directory so rootless Podman never depends on the caller's private home.
  (
    cd /tmp
    runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNTIME_USER")" "$@"
  )
}

printf '== App Builder agent boundary acceptance ==\n'
printf 'host: %s\n' "$(hostname)"
printf 'date: %s\n' "$(date -Is)"

# --- 1. Sandbox mechanism and exact task image ------------------------------
if as_runtime podman --version >/dev/null 2>&1; then
  pass "rootless sandbox mechanism: $(as_runtime podman --version)"
else
  fail "rootless podman is callable as ${RUNTIME_USER}"
  printf '\nCannot continue without the sandbox mechanism.\n' >&2
  exit 1
fi
printf 'INFO  rootless: %s\n' "$(as_runtime podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null || echo unknown)"

manifest="${REPOSITORY}/config/task-images.json"
if [[ ! -r "$manifest" ]]; then
  printf 'FAIL  cannot read %s\n' "$manifest" >&2
  exit 1
fi
image_reference="$(jq -r --arg id "$IMAGE_ID" '.images[$id].reference // ""' "$manifest")"
image_digest="$(jq -r --arg id "$IMAGE_ID" '.images[$id].digest // ""' "$manifest")"
if [[ -z "$image_reference" || ! "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  printf 'FAIL  %s is not a digest-pinned task image in %s\n' "$IMAGE_ID" "$manifest" >&2
  printf '      Build it with sudo bash ops/hetzner/build-task-image.sh and record the resulting digest through a reviewed change.\n' >&2
  exit 1
fi
if [[ -n "$EXPECTED_IMAGE_DIGEST" && "$image_digest" != "$EXPECTED_IMAGE_DIGEST" ]]; then
  printf 'FAIL  the attestation caller expected %s, but %s now declares %s\n' "$EXPECTED_IMAGE_DIGEST" "$IMAGE_ID" "$image_digest" >&2
  printf '      Refusing to prove one image and let a caller record another.\n' >&2
  exit 1
fi
PINNED_IMAGE="${image_reference}@${image_digest}"
if as_runtime podman image inspect "$PINNED_IMAGE" >/dev/null 2>&1; then
  pass "the exact reviewed task image is present: ${PINNED_IMAGE}"
else
  printf 'FAIL  the exact reviewed task image is absent from the %s rootless image store: %s\n' "$RUNTIME_USER" "$PINNED_IMAGE" >&2
  printf '      Rebuild the recorded image on this host with sudo bash ops/hetzner/build-task-image.sh.\n' >&2
  exit 1
fi

# These are the identity and namespace flags the real execution translation
# uses. Keeping them explicit here prevents a verifier that proves an easier
# sandbox than the one actual attempts receive.
TASK_IDENTITY_ARGS=(--userns=keep-id:uid=1000,gid=1000 --user 1000:1000)
TASK_BOUNDARY_ARGS=(
  --network=none --pid=private --ipc=private --uts=private --cgroupns=private
  --security-opt=no-new-privileges --cap-drop=ALL --read-only
  --memory=256m --cpus=1 --pids-limit=64 --timeout=20
  --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m
  --env-file /dev/null
)

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

# --- 3. The bypass, attempted from inside the real task image ---------------
if (( factory_live == 1 )); then
  gateway_targets=()
  for alias in host.containers.internal host.docker.internal; do gateway_targets+=("${alias}"); done
  for address in $(ip -4 -o addr show scope global 2>/dev/null | awk '{split($4,a,"/"); print a[1]}'); do gateway_targets+=("${address}"); done

  targets=("127.0.0.1|${FACTORY_PORT}" "localhost|${FACTORY_PORT}" "::1|${FACTORY_PORT}")
  for target in "${gateway_targets[@]}"; do targets+=("${target}|${FACTORY_PORT}"); done

  # The production image deliberately contains no nc/curl/ip debugging suite.
  # Use its required Node runtime for the probe instead of broadening the image
  # just to make acceptance convenient. Every connection is bounded and the
  # probes run concurrently so an unreachable address cannot serialize delays.
  probe_script='const net = require("node:net");
const specs = process.argv.slice(1);
const probe = (spec) => new Promise((resolve) => {
  const split = spec.lastIndexOf("|");
  const host = spec.slice(0, split);
  const port = Number(spec.slice(split + 1));
  const socket = net.createConnection({ host, port });
  let settled = false;
  const finish = (reached) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    console.log(`${reached ? "REACHED" : "refused"} ${spec}`);
    resolve(reached);
  };
  socket.setTimeout(3000, () => finish(false));
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
});
Promise.all(specs.map(probe)).then((results) => process.exit(results.some(Boolean) ? 1 : 0));'

  printf 'INFO  probing %s from exact image %s inside --network=none\n' "${targets[*]}" "$PINNED_IMAGE"
  if output="$(as_runtime podman run --rm \
      "${TASK_IDENTITY_ARGS[@]}" "${TASK_BOUNDARY_ARGS[@]}" \
      --entrypoint node \
      "$PINNED_IMAGE" -e "$probe_script" -- "${targets[@]}" 2>&1)"; then
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

  interface_script='const os = require("node:os");
const all = os.networkInterfaces();
const nonLoopback = Object.entries(all).filter(([name, entries]) => name !== "lo" && Array.isArray(entries) && entries.length > 0);
console.log(JSON.stringify(all));
process.exit(nonLoopback.length === 0 ? 0 : 1);'
  if interfaces="$(as_runtime podman run --rm \
      "${TASK_IDENTITY_ARGS[@]}" "${TASK_BOUNDARY_ARGS[@]}" \
      --entrypoint node "$PINNED_IMAGE" -e "$interface_script" 2>&1)"; then
    pass "a --network=none task image sees only loopback"
    printf '      %s\n' "$interfaces"
  else
    fail "a --network=none task image sees a non-loopback interface"
    printf '      %s\n' "$interfaces" >&2
  fi
fi

# --- 4. No container control socket or Factory state is exposed -------------
for host_path in /run/podman/podman.sock /var/run/podman/podman.sock /var/run/docker.sock /run/docker.sock; do
  if as_runtime podman run --rm "${TASK_IDENTITY_ARGS[@]}" "${TASK_BOUNDARY_ARGS[@]}" "$PINNED_IMAGE" test -e "$host_path" >/dev/null 2>&1; then
    fail "container control socket ${host_path} is visible inside the sandbox"
  else
    pass "container control socket ${host_path} is not visible inside the sandbox"
  fi
done
for host_path in /srv/app-builder /etc/app-builder; do
  if as_runtime podman run --rm "${TASK_IDENTITY_ARGS[@]}" "${TASK_BOUNDARY_ARGS[@]}" "$PINNED_IMAGE" test -e "$host_path" >/dev/null 2>&1; then
    fail "${host_path} is visible inside the sandbox"
  else
    pass "${host_path} is not visible inside the sandbox"
  fi
done

# --- 5. The broker socket, when enabled -------------------------------------
# The broker variables intentionally live in an EnvironmentFile so `systemctl
# show -p Environment` cannot reveal the signing key. Read only the non-secret
# socket line from that file. If the file exists, the broker was configured and
# a missing socket is a failure rather than an optional SKIP.
broker_socket=""
if [[ -r "$BROKER_ENV_FILE" ]]; then
  broker_socket="$(sed -n 's/^APP_BUILDER_AGENT_BROKER_SOCKET=//p' "$BROKER_ENV_FILE" | tail -n 1)"
fi
if [[ -n "$broker_socket" && -S "$broker_socket" ]]; then
  mode="$(stat -c '%a' "$broker_socket")"
  owner="$(stat -c '%U' "$broker_socket")"
  if [[ "$mode" == "600" && "$owner" == "$RUNTIME_USER" ]]; then
    pass "agent broker socket is owner-only (${owner}, ${mode})"
  else
    fail "agent broker socket permissions are ${owner}:${mode}, expected ${RUNTIME_USER}:600"
  fi
  if as_runtime podman run --rm \
      "${TASK_IDENTITY_ARGS[@]}" "${TASK_BOUNDARY_ARGS[@]}" \
      --volume "${broker_socket}:/run/app-builder/broker.sock:rw,Z" \
      "$PINNED_IMAGE" test -S /run/app-builder/broker.sock >/dev/null 2>&1; then
    pass "the mounted broker socket is the sandbox's one Factory reach"
  else
    fail "the broker socket did not mount into the sandbox"
  fi
elif [[ -e "$BROKER_ENV_FILE" ]]; then
  fail "agent broker is configured by ${BROKER_ENV_FILE}, but its socket is missing"
else
  skip "agent broker is not enabled on this host (run install-service-units.sh with APP_BUILDER_ENABLE_AGENT_BROKER=1)"
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
printf 'Agent boundary acceptance passed for exact image %s.\n' "$PINNED_IMAGE"
printf 'Run sudo bash ops/hetzner/attest-agent-boundary.sh to persist this proof for fail-closed runtime preflight.\n'
