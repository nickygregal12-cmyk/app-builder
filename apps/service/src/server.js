import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FactoryStore } from './store.js';
import { FactoryService } from './factory-service.js';
import { createFactoryHttpServer } from './http.js';
import { createAgentBroker } from './agent-broker.js';

// npm workspace scripts execute with the workspace as cwd. The factory service
// owns repository-level templates/config, so make that root deterministic before
// resolving service defaults or invoking generation code that reads process.cwd().
const factoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
process.chdir(factoryRoot);

const stateRoot = path.resolve(process.env.APP_BUILDER_STATE_ROOT ?? '.app-builder/service');
const workspacesRoot = path.resolve(process.env.APP_BUILDER_WORKSPACES_ROOT ?? '.app-builder/workspaces');
const host = process.env.APP_BUILDER_SERVICE_HOST ?? '127.0.0.1';
const port = Number(process.env.APP_BUILDER_SERVICE_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('APP_BUILDER_SERVICE_PORT must be a valid TCP port.');

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot, stateRoot });
const server = createFactoryHttpServer({ service, servicePort: port });

// The agent capability broker is the only Factory surface an untrusted task
// may reach (issue #55). It is off unless the operator supplies both a socket
// path and a signing secret: a broker that minted its own key, or that bound a
// default path, would be a second unauthenticated entry point rather than a
// boundary. Nothing about it is required for the Console or the MCP lane.
const brokerSocket = process.env.APP_BUILDER_AGENT_BROKER_SOCKET ?? null;
const brokerSecret = process.env.APP_BUILDER_AGENT_GRANT_SECRET ?? null;
let broker = null;

let shuttingDown = false;

server.listen(port, host, async () => {
  console.log(`App Builder service listening on http://${host}:${port}`);
  console.log(`State: ${stateRoot}`);
  console.log(`Workspaces: ${workspacesRoot}`);
  if (brokerSocket && brokerSecret) {
    const registry = JSON.parse(fs.readFileSync(path.join(factoryRoot, 'config/agent-capabilities.json'), 'utf8'));
    broker = createAgentBroker({ service, registry, secret: brokerSecret });
    console.log(`Agent capability broker listening on ${await broker.listen(brokerSocket)}`);
  } else {
    console.log('Agent capability broker: disabled (set APP_BUILDER_AGENT_BROKER_SOCKET and APP_BUILDER_AGENT_GRANT_SECRET to enable).');
  }
});

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    if (broker) await broker.close();
    await service.close();
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
