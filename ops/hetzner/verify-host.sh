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
  pass "appbuilder has no inbound SSH authorized key"
else
  fail "appbuilder has no inbound SSH authorized key"
fi

for dir in repository runtime workspaces state checkpoints logs artifacts; do
  path="/srv/app-builder/$dir"
  if [[ -d "$path" ]] && [[ "$(stat -c '%U:%G' "$path")" == "${RUNTIME_USER}:${RUNTIME_USER}" ]]; then
    pass "$path owned by appbuilder"
  else
    fail "$path owned by appbuilder"
  fi
done

check_subid_non_overlap() {
  local file="$1"
  local label="$2"
  if awk -F: -v u="$RUNTIME_USER" '
    NF >= 3 {
      s = $2 + 0; e = s + ($3 + 0) - 1;
      if ($1 == u) { as[++na] = s; ae[na] = e; }
      else { os[++no] = s; oe[no] = e; on[no] = $1; }
    }
    END {
      if (na == 0) exit 2;
      for (i = 1; i <= na; i++) {
        for (j = 1; j <= no; j++) {
          if (as[i] <= oe[j] && os[j] <= ae[i]) {
            printf "overlap with %s: %d-%d vs %d-%d\n", on[j], as[i], ae[i], os[j], oe[j] > "/dev/stderr";
            exit 1;
          }
        }
      }
    }
  ' "$file"; then
    pass "appbuilder $label range exists and does not overlap another user"
  else
    fail "appbuilder $label range exists and does not overlap another user"
  fi
}

check_subid_non_overlap /etc/subuid 'subordinate UID'
check_subid_non_overlap /etc/subgid 'subordinate GID'

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

# Co-location is allowed to have these services listening on loopback, but never
# on all interfaces. The OpenCode port is recorded when service units are installed.
opencode_port="$(jq -r '.opencodePort // 4097' /etc/app-builder-host.json 2>/dev/null || echo 4097)"
for port in 4310 5173 "$opencode_port"; do
  exposed="$(ss -H -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" && $4 !~ /^127\.0\.0\.1:/ && $4 !~ /^\[::1\]:/ {print $4}')"
  if [[ -z "$exposed" ]]; then
    pass "App Builder port $port is not publicly bound"
  else
    fail "App Builder port $port is not publicly bound (found: $exposed)"
  fi
done

if [[ -f /etc/systemd/system/app-builder-factory.service ]]; then
  if systemd-analyze verify /etc/systemd/system/app-builder-factory.service >/dev/null 2>&1; then
    pass "factory systemd unit is valid"
  else
    fail "factory systemd unit is valid"
  fi
fi
if [[ -f /etc/systemd/system/app-builder-opencode.service ]]; then
  if systemd-analyze verify /etc/systemd/system/app-builder-opencode.service >/dev/null 2>&1 && \
     grep -Fq -- "--hostname 127.0.0.1 --port ${opencode_port}" /etc/systemd/system/app-builder-opencode.service; then
    pass "OpenCode unit is valid and loopback-only"
  else
    fail "OpenCode unit is valid and loopback-only"
  fi
fi

# Rendered evidence is part of the genuine-business acceptance path this host
# serves, and the browser it needs belongs to the isolated service user rather
# than to root. The 3.8E run reached generation, verification and preview here
# and only failed at capture, so the browser is checked with everything else
# rather than discovered at the end of an expensive run.
REPOSITORY="/srv/app-builder/repository"
if [[ -d "$REPOSITORY" ]]; then
  if runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" \
    bash -lc "cd '$REPOSITORY' && node -e 'import(\"./tooling/lib/evidence-browser.mjs\").then(async (m) => process.exit((await m.evidenceBrowserStatus()).ready ? 0 : 1))'" >/dev/null 2>&1; then
    pass "rendered-evidence browser provisioned for $RUNTIME_USER"
  else
    fail "rendered-evidence browser provisioned for $RUNTIME_USER — run: sudo -u $RUNTIME_USER -H bash -lc 'cd $REPOSITORY && npx playwright install chromium'"
  fi
fi

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
