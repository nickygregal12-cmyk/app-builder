#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const e2e = process.argv.includes('--e2e');
const root = process.cwd();
const serviceHost = '127.0.0.1';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function portOption(name, envName, fallback) {
  const raw = option(name) ?? process.env[envName] ?? null;
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(`--${name} (or ${envName}) must be a valid TCP port; received "${raw}".`);
    process.exit(2);
  }
  return value;
}

/**
 * Ports are configurable because one machine can hold more than one factory.
 *
 * A host that already runs a factory under systemd owns 4310, and a second
 * stack started from a checkout is a different factory with a different state
 * root and a different set of projects. When the port was fixed there was no
 * way to run that second stack at all, and — worse — no way to notice: the
 * readiness probe answered from whichever factory held the port.
 */
const servicePort = portOption('service-port', 'APP_BUILDER_SERVICE_PORT', 4310);
const consolePort = portOption('console-port', 'APP_BUILDER_CONSOLE_PORT', e2e ? 4173 : 5173);

// Identifies the service this launcher starts, so readiness can be a statement
// about our own process rather than about the port being answered by anybody.
const serviceInstance = randomUUID();

function portOwner(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, serviceHost);
  });
}

async function refuseOccupiedPort(port, what, flag, envName) {
  if (!(await portOwner(port))) return;
  console.error(`Cannot start the ${what}: ${serviceHost}:${port} is already in use.`);
  console.error('Something else owns that port — often a factory already running under systemd, or another stack from another checkout.');
  console.error(`Point this stack somewhere else with ${flag} <port> (or ${envName}), or stop what is holding the port.`);
  console.error('If the running factory is the one you meant to use, start only the Console against it: npm run console');
  process.exit(2);
}

/**
 * Which factory the Console is looking at.
 *
 * The default is the ordinary local factory, and that stays the default. The
 * override exists because a run that produced evidence somebody else has to
 * look at is useless if the only way to reach it is to know the directory
 * layout: `--state-root` points the ordinary Console at the ordinary factory
 * state a named run left behind, so reviewing is opening a page rather than
 * reading a build tree.
 */
const explicitStateRoot = option('state-root');
const explicitWorkspacesRoot = option('workspaces-root');
const runtimeRoot = path.resolve(root, e2e ? '.tmp/console-e2e' : '.app-builder/local');
const stateRoot = explicitStateRoot ? path.resolve(root, explicitStateRoot) : path.join(runtimeRoot, 'service');
const workspacesRoot = explicitWorkspacesRoot ? path.resolve(root, explicitWorkspacesRoot) : path.join(runtimeRoot, 'workspaces');

// An explicit root that is not there is a mistake worth naming. Booting an
// empty factory instead would show a reviewer an empty project list and let
// them conclude the run never happened.
if (explicitStateRoot && !fs.existsSync(stateRoot)) {
  console.error(`No factory state at ${stateRoot}. Produce it first, then point the stack at it again.`);
  process.exit(2);
}
if (e2e) fs.rmSync(runtimeRoot, { recursive: true, force: true });
fs.mkdirSync(stateRoot, { recursive: true });
fs.mkdirSync(workspacesRoot, { recursive: true });

function child(command, args, env = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    env: { ...process.env, ...env },
  });
}

function signal(target, value) {
  if (target.exitCode !== null) return;
  if (process.platform !== 'win32' && target.pid) {
    try { process.kill(-target.pid, value); return; } catch { /* group already gone */ }
  }
  target.kill(value);
}

/**
 * Ready means *our* service answered, not that the port answered.
 *
 * A health check is a poor identity check: any factory on the port returns
 * `{ok:true}`, so a stack whose own service died on EADDRINUSE used to print a
 * success banner and start a Console proxying into a factory it did not start
 * — a different state root, a different workspaces root, somebody else's
 * projects. The instance token the child was given is what closes that.
 */
async function waitForService(target, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (target.exitCode !== null) throw new Error('Factory service exited before becoming ready.');
    try {
      const response = await fetch(`http://${serviceHost}:${servicePort}/health`);
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.instance === serviceInstance) return;
        // A stranger holds the port. Waiting cannot fix that, and continuing
        // would attach the Console to a factory this command did not start.
        throw new Error(
          `${serviceHost}:${servicePort} is answering, but it is not the factory this command started.\n`
          + 'Refusing to continue rather than pointing the Console at another factory\'s projects.\n'
          + `Use --service-port <port> for a separate stack, or npm run console to use the factory that is already running.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('not the factory this command started')) throw error;
      /* service is still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Factory service did not become healthy before the local-stack timeout.');
}

const children = [];
let closing = false;

function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const target of children) signal(target, 'SIGTERM');
  setTimeout(() => {
    for (const target of children) signal(target, 'SIGKILL');
    process.exit(code);
  }, 1200).unref();
}

function supervise(target) {
  children.push(target);
  target.once('exit', (code, signalName) => {
    if (!closing && code !== 0) {
      console.error(`Local App Builder process exited unexpectedly (${code ?? signalName ?? 'unknown'}).`);
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Say why the stack cannot start before spawning anything, rather than letting
// a child die of EADDRINUSE behind a success banner.
await refuseOccupiedPort(servicePort, 'factory service', '--service-port', 'APP_BUILDER_SERVICE_PORT');
await refuseOccupiedPort(consolePort, 'Builder Console', '--console-port', 'APP_BUILDER_CONSOLE_PORT');

const service = child('npm', ['--workspace', '@app-builder/service', 'start'], {
  APP_BUILDER_SERVICE_HOST: serviceHost,
  APP_BUILDER_SERVICE_PORT: String(servicePort),
  APP_BUILDER_SERVICE_INSTANCE: serviceInstance,
  APP_BUILDER_STATE_ROOT: stateRoot,
  APP_BUILDER_WORKSPACES_ROOT: workspacesRoot,
});
supervise(service);

try {
  await waitForService(service);
  // The Console proxies /api and /preview to the factory, so it has to be told
  // which one this stack started.
  const consoleProcess = child('npm', ['--workspace', '@app-builder/console', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(consolePort), '--strictPort'], {
    APP_BUILDER_SERVICE_HOST: serviceHost,
    APP_BUILDER_SERVICE_PORT: String(servicePort),
    // The Console checks this against the factory that answers it, so a proxy
    // pointing somewhere else is refused rather than rendered.
    APP_BUILDER_SERVICE_INSTANCE: serviceInstance,
  });
  supervise(consoleProcess);
  console.log(`App Builder stack: Console http://127.0.0.1:${consolePort} · Service http://${serviceHost}:${servicePort}`);
  console.log(`State: ${stateRoot}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
