import path from 'node:path';
import process from 'node:process';
import { FactoryStore } from './store.js';
import { FactoryService } from './factory-service.js';
import { createFactoryHttpServer } from './http.js';

const stateRoot = path.resolve(process.env.APP_BUILDER_STATE_ROOT ?? '.app-builder/service');
const workspacesRoot = path.resolve(process.env.APP_BUILDER_WORKSPACES_ROOT ?? '.app-builder/workspaces');
const host = process.env.APP_BUILDER_SERVICE_HOST ?? '127.0.0.1';
const port = Number(process.env.APP_BUILDER_SERVICE_PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('APP_BUILDER_SERVICE_PORT must be a valid TCP port.');

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot });
const server = createFactoryHttpServer({ service });
let shuttingDown = false;

server.listen(port, host, () => {
  console.log(`App Builder service listening on http://${host}:${port}`);
  console.log(`State: ${stateRoot}`);
  console.log(`Workspaces: ${workspacesRoot}`);
});

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await service.close();
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
