#!/usr/bin/env bash
set -euo pipefail

failures=0
RUNTIME_USER="appbuilder"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

if [[ -f /etc/app-builder-host.json ]] && grep -q 'app-builder-runtime-colocated' /etc/app-builder-host.json; then
  pass "shared-host bootstrap marker exists"
else
  fail "shared-host bootstrap marker exists"
fi

if runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major>22 || (major===22 && minor>=13) ? 0 : 1)' >/dev/null 2>&1; then
  version="$(runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" node --version)"
  pass "App Builder Node satisfies >=22.13 ($version)"
else
  fail "App Builder Node satisfies >=22.13"
fi

for command in git jq rg sqlite3 podman; do
  if command -v "$command" >/dev/null 2>&1; then
    pass "$command installed"
  else
    fail "$command installed"
  fi
done

if id "$RUNTIME_USER" >/dev/null 2>&1; then
  pass "appbuilder runtime user exists"
else
  fail "appbuilder runtime user exists"
fi

if sudo -n -u "$RUNTIME_USER" sudo -n true >/dev/null 2>&1; then
  fail "appbuilder has no sudo authority"
else
  pass "appbuilder has no sudo authority"
fi

if [[ ! -s "/home/${RUNTIME_USER}/.ssh/authorized_keys" ]]; then
  pass "appbuilder has no SSH authorized key"
else
  fail "appbuilder has no SSH authorized key"
fi

for dir in repository runtime workspaces state checkpoints logs artifacts; do
  path="/srv/app-builder/$dir"
  if [[ -d "$path" ]] && [[ "$(stat -c '%U:%G' "$path")" == "${RUNTIME_USER}:${RUNTIME_USER}" ]]; then
    pass "$path owned by appbuilder"
  else
    fail "$path owned by appbuilder"
  fi
done

if runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" podman --version >/dev/null 2>&1; then
  pass "rootless-container tooling callable as appbuilder"
else
  fail "rootless-container tooling callable as appbuilder"
fi

if [[ -f /etc/systemd/system/app-builder-runtime.slice ]] && systemd-analyze verify /etc/systemd/system/app-builder-runtime.slice >/dev/null 2>&1; then
  pass "App Builder resource slice is valid"
else
  fail "App Builder resource slice is valid"
fi

if [[ -x /usr/local/sbin/app-builder-run ]]; then
  pass "bounded runtime launcher installed"
else
  fail "bounded runtime launcher installed"
fi

# Co-location is allowed to have the factory listening on loopback, but never on
# all interfaces. Do not make assumptions about other applications or ports.
for port in 4310 5173; do
  exposed="$(ss -H -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" && $4 !~ /^127\.0\.0\.1:/ && $4 !~ /^\[::1\]:/ {print $4}')"
  if [[ -z "$exposed" ]]; then
    pass "App Builder port $port is not publicly bound"
  else
    fail "App Builder port $port is not publicly bound (found: $exposed)"
  fi
done

if grep -q '"hostSshModified": false' /etc/app-builder-host.json && \
   grep -q '"hostFirewallModified": false' /etc/app-builder-host.json && \
   grep -q '"globalNodeModified": false' /etc/app-builder-host.json; then
  pass "bootstrap records no SSH/firewall/global-Node takeover"
else
  fail "bootstrap records no SSH/firewall/global-Node takeover"
fi

if (( failures > 0 )); then
  printf '\n%d shared-host verification check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf '\nHetzner App Builder co-location baseline is healthy. Existing host services remain separate; autonomous runtime is still disabled.\n'
