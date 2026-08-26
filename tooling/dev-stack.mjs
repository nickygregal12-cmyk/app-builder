#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const e2e = process.argv.includes('--e2e');
const root = process.cwd();
const servicePort = 4310;
const consolePort = e2e ? 4173 : 5173;

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
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

async function waitForService(target, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (target.exitCode !== null) throw new Error('Factory service exited before becoming ready.');
    try {
      const response = await fetch(`http://127.0.0.1:${servicePort}/health`);
      if (response.ok) return;
    } catch { /* service is still booting */ }
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

const service = child('npm', ['--workspace', '@app-builder/service', 'start'], {
  APP_BUILDER_SERVICE_HOST: '127.0.0.1',
  APP_BUILDER_SERVICE_PORT: String(servicePort),
  APP_BUILDER_STATE_ROOT: stateRoot,
  APP_BUILDER_WORKSPACES_ROOT: workspacesRoot,
});
supervise(service);

try {
  await waitForService(service);
  const consoleProcess = child('npm', ['--workspace', '@app-builder/console', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', String(consolePort), '--strictPort']);
  supervise(consoleProcess);
  console.log(`App Builder stack: Console http://127.0.0.1:${consolePort} · Service http://127.0.0.1:${servicePort}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  shutdown(1);
}
