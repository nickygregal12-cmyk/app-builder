# App Builder on the Existing Hetzner Host

Status: **co-located host infrastructure validated; autonomous runtime disabled**. The isolated App Builder runtime area now exists on the existing Hetzner server without buying another VM. The Factory and authenticated OpenCode endpoints have been exercised successfully on loopback, but broad autonomous work remains deliberately disabled.

`docs/AGENT_RUNTIME.md`, the control plane and the future `AgentRuntimeAdapter` remain authoritative for runtime behaviour.

The App Builder runtime may share the physical/virtual host with the Euro Predictor, but it must not share project state, repositories, prompts, credentials, process identity or unrestricted resources.

## Co-location model

```text
existing Hetzner server
|
+-- existing Predictor services/users/data   (left alone)
|
+-- appbuilder Linux user                    (non-sudo, no inbound SSH key)
    +-- /srv/app-builder/repository
    +-- /srv/app-builder/runtime
    +-- /srv/app-builder/workspaces
    +-- /srv/app-builder/state
    +-- /srv/app-builder/checkpoints
    +-- /srv/app-builder/artifacts
    +-- isolated Node 22 toolchain
    +-- rootless Podman
    +-- app-builder-runtime.slice resource cap
    +-- Factory service on 127.0.0.1:4310
    +-- OpenCode 1.18.14 on 127.0.0.1:4097 + Basic Auth
    +-- future AgentRuntimeAdapter / bounded workers
```

A second server is **not** required. Move to a separate host later only if measured App Builder CPU, memory or browser/database workloads materially interfere with the existing application.

## Safety rule for an existing server

Do not apply a new-host cloud-init or reset machine-wide security settings just to install App Builder.

The co-located installer deliberately does **not**:

- change `sshd_config`;
- add/remove SSH users used by existing projects;
- reset or replace UFW/iptables/nftables/Hetzner firewall rules;
- replace the host's global Node/npm version;
- stop, restart or reconfigure existing Predictor services;
- reuse Predictor directories, repositories, prompts or secrets;
- expose new public ports;
- start App Builder or OpenCode automatically.

## 1. Run the read-only preflight first

Before changing the server, run:

```bash
bash ops/hetzner/preflight-existing-host.sh
```

The preflight makes **no changes**. It reports:

- operating system, kernel and architecture;
- CPU, RAM and disk capacity;
- whether the required systemd model is available;
- collisions with an existing `appbuilder` user, `/srv/app-builder` tree or resource slice;
- whether factory/Console ports `4310`/`5173` or the planned App Builder OpenCode port `4097` are already in use;
- whether Podman/Docker/global Node are already present;
- conservative CPU and memory limits derived from the server's capacity.

A hard collision fails the preflight and means the installer should not be run until it is understood. Capacity findings are warnings rather than guesses about the existing workload.

For additional manual context, these remain useful:

```bash
nproc
free -h
df -h /
systemctl --failed
```

The installer's default App Builder slice is intentionally conservative:

- CPU quota: `150%` (up to 1.5 CPU cores worth of sustained time);
- memory high watermark: `25%` of host RAM;
- hard memory maximum: `35%` of host RAM;
- task/process cap: `1024`.

Prefer the preflight's suggested starting values when they are lower than those defaults. Override during installation only when the existing server has enough spare capacity, for example:

```bash
sudo \
  APP_BUILDER_CPU_QUOTA=125% \
  APP_BUILDER_MEMORY_HIGH=20% \
  APP_BUILDER_MEMORY_MAX=30% \
  bash ops/hetzner/install-existing-host.sh
```

## 2. Install the isolated host baseline

From a checkout of this repository on the existing server:

```bash
sudo bash ops/hetzner/install-existing-host.sh
```

The installer:

- creates `appbuilder` if it does not exist;
- fails closed if an unrelated pre-existing `appbuilder` identity or `/srv/app-builder` tree would be taken over;
- locks the runtime account's password and removes any `authorized_keys`;
- does not add it to sudo;
- creates App Builder-owned directories under `/srv/app-builder`;
- installs Node 22 under `/opt/app-builder/node`, then exposes it only through the `appbuilder` account's `~/.local/bin`;
- does not replace the server's existing `/usr/bin/node` or `/usr/local/bin/node`;
- supports x64 and arm64 hosts;
- installs rootless Podman prerequisites for future disposable workspaces;
- allocates subordinate UID/GID ranges without overlapping ranges already present on the shared host;
- creates `app-builder-runtime.slice` with CPU/memory/task limits;
- creates `app-builder-run`, the bounded launcher future service/runtime commands can use;
- writes `/etc/app-builder-host.json` recording that SSH, firewall and global Node were not taken over;
- starts no new service and installs no model/provider secret.

## 3. Verify isolation

Run:

```bash
sudo bash ops/hetzner/verify-host.sh
```

The check verifies that:

- the `appbuilder` account exists and has no sudo authority;
- it has no inbound SSH authorized key;
- App Builder directories are owned by that account;
- its own Node satisfies the repository's `>=22.13` requirement;
- subordinate UID/GID ranges do not overlap another host user;
- rootless-container tooling is callable;
- the resource slice is syntactically valid;
- the bounded launcher exists;
- App Builder ports are never publicly bound;
- optional service units, if installed, are valid and OpenCode remains loopback-only;
- the installation record says host SSH, firewall and global Node were left untouched.

It deliberately does not judge or rewrite unrelated host firewall/SSH configuration because another application already lives on the machine.

## 4. Repository placement

Keep the App Builder checkout separate from the existing project's checkout. The intended location is:

```text
/srv/app-builder/repository
```

Do not place App Builder inside the Predictor repository or vice versa.

Repository credentials should be App Builder-specific and minimal. Do not copy a broad personal or Predictor token into the `appbuilder` home directory.

## 5. OpenCode binary

Installing OpenCode is safe as a local tool; enabling unrestricted autonomous work is not.

After the host baseline:

```bash
sudo bash ops/hetzner/install-opencode.sh
```

This installs the pinned CLI only into `/home/appbuilder/.local` using App Builder's isolated Node/npm toolchain.

It does not:

- configure OpenAI/Anthropic/other provider credentials;
- create autonomous loops;
- grant sudo;
- bypass ChangeSets, budgets, independent review or approvals.

Provider credentials should eventually be injected by a scoped secret broker for a named task/role/environment, not stored in repository files or shell profiles.

## 6. Install and validate local service units

Once the App Builder repository is at `/srv/app-builder/repository`, dependencies are installed, and OpenCode is installed, prepare the two local services:

```bash
sudo bash ops/hetzner/install-service-units.sh
```

This installs but does **not** enable or start:

- `app-builder-factory.service` — the existing factory service, bound explicitly to `127.0.0.1:4310` with state under `/srv/app-builder/state/service` and workspaces under `/srv/app-builder/workspaces`;
- `app-builder-opencode.service` — `opencode serve` bound explicitly to `127.0.0.1:4097` by default.

OpenCode itself normally defaults to port `4096`; App Builder intentionally uses `4097` so it does not compete with the existing Predictor OpenCode runtime. Override with `APP_BUILDER_OPENCODE_PORT` only if the preflight shows `4097` is unavailable.

Both units run as `appbuilder`, inherit `app-builder-runtime.slice`, use restrictive umasks/no-new-privileges controls, and are separate from Predictor services. The installer creates a random local OpenCode HTTP Basic Auth password at `/etc/app-builder/opencode-server.env`; it contains no model/provider credential.

The OpenCode server exists only as a local runtime endpoint for the future `AgentRuntimeAdapter`. Starting it does not grant autonomous permissions or production authority.

The services can be exercised explicitly rather than auto-starting them during host setup:

```bash
sudo systemctl start app-builder-factory.service
sudo systemctl start app-builder-opencode.service
sudo systemctl status app-builder-factory.service app-builder-opencode.service
```

Factory health:

```bash
curl --fail --silent --show-error http://127.0.0.1:4310/health
```

Authenticated OpenCode health without printing the generated password:

```bash
sudo bash -c '
  set -a
  source /etc/app-builder/opencode-server.env
  set +a
  curl --fail --silent --show-error \
    -u "$OPENCODE_SERVER_USERNAME:$OPENCODE_SERVER_PASSWORD" \
    http://127.0.0.1:4097/global/health
'
```

An unauthenticated request to the OpenCode health route should return `401`, proving the local HTTP auth boundary is active.

Do not enable either service at boot until runtime recovery/ownership is intentionally promoted from manual host validation to an accepted operations contract.

### Validated live-host result — 2026-08-26

The real co-located host has passed the infrastructure acceptance intended by this runbook:

- `verify-host.sh` passes all shared-host/isolation checks;
- the Factory is stable on `127.0.0.1:4310`, reports service version `2`, and has zero observed restarts after dependency repair;
- Factory state/workspaces resolve under `/srv/app-builder`, not the repository;
- OpenCode `1.18.14` is stable on `127.0.0.1:4097` with zero observed restarts;
- authenticated OpenCode health returns `200` with `{"healthy":true,"version":"1.18.14"}`;
- unauthenticated OpenCode health returns `401`;
- the existing project-specific OpenCode endpoint remains independently on its existing loopback port;
- `5173` is not running;
- no App Builder service is publicly bound;
- autonomous runtime and provider credentials remain disabled.

This is **infrastructure evidence, not a Phase 5 runtime promotion**. `config/factory-status.json` and the product-proof gate remain authoritative for sequencing.

## 7. Running bounded one-off commands

For a simple bounded command outside a long-lived unit:

```bash
sudo app-builder-run /home/appbuilder/.local/bin/node --version
```

Future systemd units/AgentRuntimeAdapter workers should use `app-builder-runtime.slice` rather than unrestricted background processes.

Do not run long-lived OpenCode workers directly as root or as the existing Predictor service account.

## 8. Network exposure

The current factory service, Console and OpenCode server should remain loopback-only on the shared server. There is no need to add public firewall rules for `4310`, `5173`, `4097` or arbitrary preview ports.

When intentionally running the stack later, access it through the server's existing secure administration path, for example SSH local forwarding:

```bash
ssh \
  -L 4097:127.0.0.1:4097 \
  -L 4310:127.0.0.1:4310 \
  -L 5173:127.0.0.1:5173 \
  YOUR_EXISTING_ADMIN_USER@SERVER_IP
```

Use the existing server's known-good SSH identity; this setup does not create a replacement administrator account.

## 9. When a second server becomes justified

Do not pay for another VM pre-emptively. Measure first.

A separate App Builder server becomes worthwhile if one or more of these persist despite resource limits:

- App Builder builds noticeably slow or destabilise the Predictor;
- Chromium/browser evidence regularly causes memory pressure or OOM kills;
- local Supabase/Postgres testing creates unacceptable I/O contention;
- multiple concurrent workers need more CPU than the shared slice can safely grant;
- operational/security requirements eventually demand a machine boundary rather than a user/container boundary.

Because durable App Builder state lives under its own `/srv/app-builder` tree and runtime providers are adapters, migration to another server later should be an infrastructure move rather than an application redesign.

## 10. Still deliberately deferred

The host boundary is now proven, but these remain later runtime work:

- `ExecutionEnvironmentAdapter` per-task sandbox lifecycle;
- `AgentRuntimeAdapter` around OpenCode;
- bounded worker scheduling;
- scoped secret broker;
- development/preview/production environment identity enforcement;
- model/cost routing;
- per-role fresh-session/context packet delivery;
- checkpoint/resume orchestration;
- structured progress/usage ingestion into the Event Ledger;
- independent cross-model reviewer execution;
- production deploy/database approval integration.

The important result is that we can build those capabilities on the server you already pay for without giving App Builder root access or coupling it to the Predictor runtime.