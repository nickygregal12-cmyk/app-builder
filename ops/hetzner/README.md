# App Builder on the Existing Hetzner Host

Status: **co-located host bootstrap only**. This prepares an isolated App Builder runtime area on the existing Hetzner server without buying another VM and without enabling broad autonomous work.

`docs/AGENT_RUNTIME.md`, the control plane and the future `AgentRuntimeAdapter` remain authoritative for runtime behaviour.

The App Builder runtime may share the physical/virtual host with the Euro Predictor, but it must not share project state, repositories, prompts, credentials, process identity or unrestricted resources.

## Co-location model

```text
existing Hetzner server
|
+-- existing Predictor services/users/data   (left alone)
|
+-- appbuilder Linux user                    (non-sudo, no SSH key)
    +-- /srv/app-builder/repository
    +-- /srv/app-builder/runtime
    +-- /srv/app-builder/workspaces
    +-- /srv/app-builder/state
    +-- /srv/app-builder/checkpoints
    +-- /srv/app-builder/artifacts
    +-- isolated Node 22 toolchain
    +-- rootless Podman
    +-- app-builder-runtime.slice resource cap
    +-- future AgentRuntimeAdapter/OpenCode workers
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

## 1. Check available capacity

Before installing, record the current server shape and load:

```bash
nproc
free -h
df -h /
systemctl --failed
```

The default App Builder slice is intentionally conservative:

- CPU quota: `150%` (up to 1.5 CPU cores worth of sustained time);
- memory high watermark: `25%` of host RAM;
- hard memory maximum: `35%` of host RAM;
- task/process cap: `1024`.

These are protection defaults, not performance targets. Override them during installation only when the existing server has enough spare capacity, for example:

```bash
sudo \
  APP_BUILDER_CPU_QUOTA=250% \
  APP_BUILDER_MEMORY_HIGH=35% \
  APP_BUILDER_MEMORY_MAX=45% \
  bash ops/hetzner/install-existing-host.sh
```

## 2. Install the isolated host baseline

From a checkout of this branch/repository on the existing server:

```bash
sudo bash ops/hetzner/install-existing-host.sh
```

The installer:

- creates `appbuilder` if it does not exist;
- locks its password and removes any `authorized_keys`;
- does not add it to sudo;
- creates App Builder-owned directories under `/srv/app-builder`;
- installs Node 22 under `/opt/app-builder/node`, then exposes it only through the `appbuilder` account's `~/.local/bin`;
- does not replace the server's existing `/usr/bin/node` or `/usr/local/bin/node`;
- installs rootless Podman prerequisites for future disposable workspaces;
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
- it has no SSH authorized key;
- App Builder directories are owned by that account;
- its own Node satisfies the repository's `>=22.13` requirement;
- rootless-container tooling is callable;
- the resource slice is syntactically valid;
- the bounded launcher exists;
- factory/Console ports `4310` and `5173` are not bound publicly;
- the installation record says host SSH, firewall and global Node were left untouched.

It deliberately does not judge or rewrite unrelated host firewall/SSH configuration because another application already lives on the machine.

## 4. Repository placement

Keep the App Builder checkout separate from the existing project's checkout. The intended eventual location is:

```text
/srv/app-builder/repository
```

Do not place App Builder inside the Predictor repository or vice versa.

Repository credentials should be App Builder-specific and minimal. Do not copy a broad personal or Predictor token into the `appbuilder` home directory.

## 5. OpenCode binary

Installing OpenCode is safe as a dormant tool; enabling unrestricted autonomous work is not.

After the host baseline:

```bash
sudo bash ops/hetzner/install-opencode.sh
```

This installs the pinned CLI only into `/home/appbuilder/.local` using App Builder's isolated Node/npm toolchain.

It does not:

- configure OpenAI/Anthropic/other provider credentials;
- start a daemon or public OpenCode endpoint;
- create autonomous loops;
- grant sudo;
- bypass ChangeSets, budgets, independent review or approvals.

Provider credentials should eventually be injected by a scoped secret broker for a named task/role/environment, not stored in repository files or shell profiles.

## 6. Running App Builder processes without affecting the host

Future service/runtime processes should be launched through the resource slice rather than as unrestricted background processes.

For a simple bounded command:

```bash
sudo app-builder-run /home/appbuilder/.local/bin/node --version
```

The future systemd units/AgentRuntimeAdapter should explicitly use `app-builder-runtime.slice` too.

Do not run long-lived OpenCode workers directly as root or as the existing Predictor service account.

## 7. Network exposure

The current factory service/Console should remain loopback-only on the shared server. There is no need to add public firewall rules for `4310`, `5173` or arbitrary preview ports.

When intentionally running the stack later, access it through the server's existing secure administration path, for example SSH local forwarding:

```bash
ssh \
  -L 4310:127.0.0.1:4310 \
  -L 5173:127.0.0.1:5173 \
  YOUR_EXISTING_ADMIN_USER@SERVER_IP
```

Use the existing server's known-good SSH identity; this setup does not create a replacement administrator account.

## 8. When a second server becomes justified

Do not pay for another VM pre-emptively. Measure first.

A separate App Builder server becomes worthwhile if one or more of these persist despite resource limits:

- App Builder builds noticeably slow or destabilise the Predictor;
- Chromium/browser evidence regularly causes memory pressure or OOM kills;
- local Supabase/Postgres testing creates unacceptable I/O contention;
- multiple concurrent workers need more CPU than the shared slice can safely grant;
- operational/security requirements eventually demand a machine boundary rather than a user/container boundary.

Because durable App Builder state lives under its own `/srv/app-builder` tree and runtime providers are adapters, migration to another server later should be an infrastructure move rather than an application redesign.

## 9. Still deliberately deferred

This setup prepares the host boundary only. These remain later runtime work:

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
