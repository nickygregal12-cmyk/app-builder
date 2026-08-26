# Dedicated Hetzner App Builder Host

Status: **host bootstrap only**. This prepares the dedicated App Builder machine without enabling broad autonomous work. `docs/AGENT_RUNTIME.md`, the control plane and the future `AgentRuntimeAdapter` remain authoritative for runtime behaviour.

The host must be separate from the Euro Predictor runtime and must not inherit its prompts, credentials, repositories or permissions.

## Recommended initial Hetzner shape

Create a dedicated Hetzner Cloud project named `App Builder` and place this host in it.

Initial server choice:

- server name: `app-builder-runtime`;
- location: `nbg1` (Nuremberg) unless another EU location is operationally preferable;
- architecture: x86;
- initial type: `CX43`;
- image: Ubuntu 24.04;
- public IPv4: enabled for straightforward administration;
- IPv6: enabled;
- backups: optional during bootstrap; enable before the machine becomes the only copy of durable runtime state;
- labels: `project=app-builder`, `role=agent-runtime`, `env=development`.

`CX43` is intentionally a bootstrap size, not a permanent capacity decision. Before multiple workers run concurrently, benchmark real build/browser/Supabase workloads and rescale within the x86 family if CPU or memory contention is measurable. Prefer a dedicated-CPU `CCX` class when predictable concurrent worker performance becomes more valuable than the shared-instance saving.

## 1. Add an SSH key first

In Hetzner Console, add the administrator's SSH public key under the dedicated project's security settings and select that key when creating the server.

The cloud-init bootstrap depends on `/root/.ssh/authorized_keys` being present. It copies that key to the human-only `builderadmin` account and only then disables root SSH.

Do not create the server using password-only SSH.

## 2. Create a Hetzner Cloud Firewall

Create a firewall such as `app-builder-runtime` and attach it to the server or to the `project=app-builder,role=agent-runtime` label selector.

Inbound:

- TCP 22 from the administrator's current public IPv4 `/32`;
- optionally TCP 22 from the administrator's IPv6 `/128`.

No other inbound rule is required for the bootstrap host.

Do **not** expose:

- factory service `4310`;
- Builder Console `5173`;
- arbitrary Vite/preview ports;
- OpenCode/server ports;
- database ports.

Outbound may remain unrestricted during bootstrap because repository access, package installation and approved public-network research require it. The future ExecutionEnvironmentAdapter owns per-task network restrictions.

## 3. Paste the cloud-init

When creating the server, paste the complete contents of `ops/hetzner/cloud-init.yaml` into Hetzner's cloud-init/user-data field.

The bootstrap:

- creates `builderadmin` as the SSH/sudo administrator;
- creates `appbuilder` as a non-sudo runtime identity that cannot log in over SSH;
- disables password and root SSH after the admin key is copied;
- installs a pinned Node 22 version satisfying the repository's `>=22.13` requirement and verifies the Node-published checksum;
- installs Git, ripgrep, SQLite and general build tools;
- installs rootless-container prerequisites and Podman for the later `ExecutionEnvironmentAdapter`;
- creates separate durable state/checkpoint/artifact and disposable workspace directories under `/srv/app-builder`;
- enables UFW and Fail2ban;
- opens only SSH on the host firewall;
- does not clone a private repository, install provider credentials, expose a service, or start autonomous agents.

## 4. Verify the host

After cloud-init completes:

```bash
ssh builderadmin@SERVER_IP
```

Once the repository has been cloned through an approved GitHub credential/deploy-key path, run:

```bash
cd /path/to/app-builder
sudo bash ops/hetzner/verify-host.sh
```

The verification fails if the runtime user gained sudo, SSH is not hardened, required runtime directories are missing, Node is too old, or factory ports are already listening unexpectedly.

## 5. OpenCode binary: safe to install, not safe to unleash

OpenCode is the intended first runtime adapter implementation. Installing its CLI on the host does not make it the factory runtime.

To install the reviewed/pinned CLI for the unprivileged runtime user:

```bash
cd /path/to/app-builder
sudo bash ops/hetzner/install-opencode.sh
```

That script deliberately does **not**:

- configure OpenAI/Anthropic/other provider secrets;
- start a public OpenCode service;
- clone arbitrary repositories;
- give the `appbuilder` user sudo;
- enable autonomous loops;
- bypass factory budgets, ChangeSets, review independence or approval policy.

Provider credentials should eventually be injected by the scoped secret broker for a named task/role/environment. Do not place broad API keys in shell profiles, repository files, Dockerfiles, images or globally readable environment files.

## 6. Private access to the current factory stack

The factory service already binds to loopback by design. When it is intentionally run on the host, reach it over SSH forwarding rather than opening its ports publicly:

```bash
ssh \
  -L 4310:127.0.0.1:4310 \
  -L 5173:127.0.0.1:5173 \
  builderadmin@SERVER_IP
```

Then local browser access can use `127.0.0.1:4310` and `127.0.0.1:5173` through the tunnel.

A later private API/proxy may replace this operationally, but it must preserve the control-plane authorization boundary rather than turning the development service into a public unauthenticated endpoint.

## 7. Repository access

Do not reuse a personal GitHub token from another project on this host.

The preferred host bootstrap path is a dedicated App Builder GitHub credential with the minimum repository permissions needed. Runtime task identities should eventually receive narrower repository/worktree scope through the runtime adapter rather than inheriting the host administrator's GitHub identity.

## 8. What remains deliberately deferred

This host can exist now while Phase 4 work continues, but these pieces remain Phase 3.5C/5 runtime work:

- `ExecutionEnvironmentAdapter` implementation and per-task disposable sandbox lifecycle;
- `AgentRuntimeAdapter` implementation around OpenCode;
- bounded worker pool and scheduling;
- scoped secret broker;
- environment identity enforcement for development/preview/production;
- model/cost routing;
- per-role fresh-session launch and context packet delivery;
- checkpoint/resume orchestration;
- structured OpenCode progress/usage ingestion into the Event Ledger;
- independent cross-model reviewer execution;
- production deploy/database approval integration.

The important result of this bootstrap is that none of those later features need unrestricted root access or a rebuild of the basic host security model.
