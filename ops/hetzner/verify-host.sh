#!/usr/bin/env bash
set -euo pipefail

failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

if [[ ! -f /etc/app-builder-host.json ]]; then
  fail "host bootstrap marker exists"
else
  pass "host bootstrap marker exists"
fi

if command -v node >/dev/null 2>&1 && node -e 'const [major,minor]=process.versions.node.split(".").map(Number); process.exit(major>22 || (major===22 && minor>=13) ? 0 : 1)'; then
  pass "Node satisfies >=22.13 ($(node --version))"
else
  fail "Node satisfies >=22.13"
fi

for command in git jq rg sqlite3 podman; do
  if command -v "$command" >/dev/null 2>&1; then
    pass "$command installed"
  else
    fail "$command installed"
  fi
done

if id appbuilder >/dev/null 2>&1; then
  pass "appbuilder runtime user exists"
else
  fail "appbuilder runtime user exists"
fi

if id builderadmin >/dev/null 2>&1; then
  pass "builderadmin user exists"
else
  fail "builderadmin user exists"
fi

if sudo -n -u appbuilder sudo -n true >/dev/null 2>&1; then
  fail "appbuilder has no sudo authority"
else
  pass "appbuilder has no sudo authority"
fi

for dir in runtime workspaces state checkpoints logs artifacts; do
  path="/srv/app-builder/$dir"
  if [[ -d "$path" ]] && [[ "$(stat -c '%U:%G' "$path")" == "appbuilder:appbuilder" ]]; then
    pass "$path owned by appbuilder"
  else
    fail "$path owned by appbuilder"
  fi
done

if sudo -u appbuilder podman --version >/dev/null 2>&1; then
  pass "rootless-container tooling callable as appbuilder"
else
  fail "rootless-container tooling callable as appbuilder"
fi

if sudo sshd -T 2>/dev/null | grep -q '^permitrootlogin no$'; then
  pass "root SSH disabled"
else
  fail "root SSH disabled"
fi

if sudo sshd -T 2>/dev/null | grep -q '^passwordauthentication no$'; then
  pass "SSH password authentication disabled"
else
  fail "SSH password authentication disabled"
fi

if sudo sshd -T 2>/dev/null | grep -q '^allowusers builderadmin$'; then
  pass "only builderadmin is SSH-login eligible"
else
  fail "only builderadmin is SSH-login eligible"
fi

if sudo ufw status | grep -q '^Status: active$'; then
  pass "host firewall active"
else
  fail "host firewall active"
fi

public_ports="$(sudo ss -H -ltn | awk '{print $4}' | sed -E 's/^.*:([0-9]+)$/\1/' | sort -u)"
for forbidden in 4310 5173; do
  if grep -qx "$forbidden" <<<"$public_ports"; then
    fail "factory port $forbidden is not listening before runtime wiring"
  else
    pass "factory port $forbidden is not listening before runtime wiring"
  fi
done

if (( failures > 0 )); then
  printf '\n%d host verification check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf '\nHetzner App Builder host baseline is healthy. Autonomous runtime remains disabled until AgentRuntimeAdapter integration.\n'
