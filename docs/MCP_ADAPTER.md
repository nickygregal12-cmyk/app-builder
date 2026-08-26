# MCP Adapter

Phase 3.8F exposes the existing App Builder service through a deliberately thin Model Context Protocol adapter so Codex, ChatGPT-compatible MCP clients, Claude Code and OpenCode can invoke the same deterministic factory operations without becoming new sources of project truth.

Architecture:

```text
MCP client
  -> apps/mcp (protocol adapter only)
  -> loopback apps/service HTTP contract
  -> deterministic factory / control plane
  -> service-owned bounded project workspace
```

## Transport

The first adapter uses stdio because the intended development clients launch local MCP processes. It uses the stable MCP TypeScript SDK v2 `serveStdio` entry, which owns stdout as the protocol channel. Adapter diagnostics must use stderr; application code must never write debug text to stdout.

Start the local factory service in one process:

```bash
npm run service
```

Configure the MCP host to launch:

```bash
npm run mcp
```

The adapter defaults to `http://127.0.0.1:4310` and accepts `APP_BUILDER_SERVICE_URL` only when it remains a loopback HTTP(S) origin. Remote MCP/service authentication is a later deployment concern and must not be approximated by silently allowing arbitrary service URLs.

## Exposed tools

The initial surface mirrors `apps/service/src/tool-contract.js`:

- project list/create/read;
- Manifest, knowledge-pack and composition reads;
- source ingestion and the ingested-source inventory;
- deterministic generate and independent verify;
- task/event/metric/checkpoint reads;
- preview status/start/stop;
- integration configured/not-configured status.

MCP tool names use underscores for broad client compatibility, while every tool records the service-contract operation it delegates to. `tooling/mcp-adapter.test.mjs` and `tooling/mcp-doctor.mjs` fail when an MCP tool is not backed by the declared service tool contract.

A distinct `recompose` tool is intentionally not exposed yet because `apps/service` does not currently own a distinct recompose operation. Add the service capability first, then expose it through MCP. Do not alias or invent operations in the adapter.

## Explicitly excluded

The MCP facade does **not** expose:

- production deployment;
- production database writes;
- secret reads or mutation;
- arbitrary filesystem paths;
- shell/command execution;
- general-purpose HTTP fetching.

Source ingestion is the one operation that causes outbound requests, and it is
not a fetch proxy. Remote sources must be public `http(s)` addresses; the
deterministic content-intelligence pipeline refuses private, loopback and
otherwise unsafe destinations, bounds response size, redirects and crawl
breadth, and returns normalised source data rather than raw responses. Uploaded
files arrive as inline content — a client cannot name a filesystem path — and
everything imported keeps `instructionAuthority: none`.

The MCP client cannot choose a project filesystem path. Project identifiers are bounded and every project operation maps to a fixed service route. The service remains responsible for Manifest/knowledge validation, durable tasks/events/checkpoints and workspace containment.

## OpenCode client lane

`opencode.json` in the repository root is the whole OpenCode-side configuration. It declares one
local MCP server that launches the existing adapter and nothing else:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "app-builder": {
      "type": "local",
      "command": ["npm", "run", "mcp"],
      "enabled": true,
      "environment": { "APP_BUILDER_SERVICE_URL": "http://127.0.0.1:4310" }
    }
  },
  "permission": { "bash": "deny", "edit": "deny", "webfetch": "deny" },
  "share": "disabled",
  "autoupdate": false
}
```

Validated against **OpenCode 1.18.14**, the version the Hetzner runtime records. The shape is
version-sensitive in a way that fails silently: OpenCode 1.x resolves an MCP entry it does not
recognise — `"type": "stdio"`, or `command` as a string — down to `{ "enabled": true }`, discarding
the command without an error or a warning. Copying later configuration syntax therefore produces an
agent that has quietly lost the Factory lane rather than one that refuses to start.
`npm run opencode:doctor` exists to catch exactly that, and runs as part of `npm run check`.

`permission` and `autoupdate` are client-side configuration, not a boundary. They keep this
configuration from offering a second route to the Factory; they do not stop a process on the host
from reaching `127.0.0.1:4310` directly. That gap is issue #55 and remains open.

### Proving the lane

With the factory service running (`npm run service`, or the hosted `app-builder-factory.service`):

```bash
npm run opencode:smoke                 # bounded journey + capability exclusions
npm run opencode:smoke -- --project PROJECT_ID --out evidence.json
```

The smoke test launches the adapter exactly as `opencode.json` declares it and drives it over the
MCP protocol, so it exercises the agent-facing lane rather than the internal service HTTP surface.
It asserts the served tool list equals the declared bindings, walks project list/read, Manifest,
composition, tasks, events, checkpoints, metrics and preview status, and then proves the exclusions:
no tool on the surface matches a secret, filesystem, shell, fetch, deployment or database capability;
an unregistered tool name is rejected rather than executed; a traversing or absolute `projectId` is
refused; ingestion refuses `file://`, loopback and link-local destinations; and the adapter fails to
start at all against a non-loopback service origin. It finishes by re-reading the event ledger to
confirm the refusals were recorded as durable Factory state.

Invoking a tool *through an OpenCode model session* additionally requires provider credentials, which
remain deliberately absent. What is proven without them is that OpenCode connects to and handshakes
with the adapter (`opencode mcp list` reports `app-builder connected`, and `GET /mcp` on the loopback
OpenCode server reports `{"app-builder":{"status":"connected"}}`), and that the adapter behind that
connection behaves as bounded above.

## Security model

MCP is an interoperability adapter, not an authority layer. A tool call can only request an operation already represented by the factory service contract. Adding a powerful operation therefore requires, in order:

1. define and secure it at the factory/service boundary;
2. add the appropriate policy/approval semantics;
3. test it directly through the service;
4. only then consider exposing it through MCP.

This keeps future OpenCode/Hetzner agent loops, desktop MCP hosts and other clients on one deterministic control path rather than growing provider-specific backdoors.
