/**
 * Which server a browser lane is actually talking to.
 *
 * Every Playwright config in this repository used to name a fixed port and set
 * `reuseExistingServer: !process.env.CI`. Together those two lines mean "if
 * anything answers on this port, that is the product under test". On a machine
 * running one checkout that is true. On this machine it is not: several
 * worktrees run App Builder at once, and on 2026-08-31 a visual session's
 * `npm run test:e2e` attached to a *different* worktree's Builder Console and
 * reported seven failures against a build that session had never made. Hosted
 * CI showed one real failure, so the local run was not merely noisy — it was
 * evidence about the wrong software.
 *
 * The generated-project lanes are the serious half. `playwright.accessibility`
 * and `playwright.generated-app` both named 4373, so two lanes collided inside
 * a single worktree as well as across worktrees — and those lanes photograph a
 * generated site and publish the pictures as an evidence packet for an
 * independent reviewer. A packet is a claim about one business's website. If
 * the port was answered by another worktree's generated project, the packet is
 * a claim about somebody else's.
 *
 * `dev-stack.mjs` already solved its half of this: it refuses to start on an
 * occupied port and checks an instance token before calling itself ready. None
 * of that ran, because `reuseExistingServer` meant Playwright never started
 * `dev-stack` at all. So the fix belongs here, in front of the lane.
 *
 * Two rules, and both are needed:
 *
 * - **A lane owns its port.** Ports are derived from the absolute path of the
 *   checkout, so two worktrees never choose the same one and the same worktree
 *   always chooses the same one. Deterministic matters: a random port would
 *   make a failed run impossible to re-attach a browser to, and would put a
 *   different number in every evidence record.
 * - **A lane starts its own server.** `reuseExistingServer` is false
 *   everywhere, and the command refuses before it spawns if the port is held.
 *   Waiting on a URL is not an identity check — a stranger returns 200 as
 *   readily as we do — so the only safe moment to look is before anything is
 *   listening.
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * The checkout, found by looking for it rather than from `import.meta.url`.
 *
 * Playwright transpiles a `.ts` config to CommonJS and pulls its imports in the
 * same way, so `import.meta` in this file is a syntax error inside every lane
 * that imports it — which is every lane. `generated-preview.mjs` sidesteps the
 * same trap by taking a path argument, and this walks up from the working
 * directory instead, which is where `npx playwright` and every npm script run.
 */
function findRoot(from = process.cwd()) {
  let directory = path.resolve(from);
  for (;;) {
    if (fs.existsSync(path.join(directory, 'tooling/lib/e2e-server.mjs'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return path.resolve(from);
    directory = parent;
  }
}

const ROOT = findRoot();

export const HOST = '127.0.0.1';

/**
 * One band per lane, so a worktree can run two lanes at once.
 *
 * Deliberately above the ranges the factory itself uses. 4310 is the service a
 * host may already run under systemd and 5173 is the ordinary Console; a lane
 * that landed on either would be fighting the developer's own stack rather
 * than another worktree's.
 */
export const LANE_BANDS = Object.freeze({
  'console-e2e': 7000,
  'console-e2e-service': 7100,
  accessibility: 7200,
  'real-business': 7300,
  'generated-app': 7400,
  portability: 7500,
});

/** How many checkouts can coexist before two of them share a port. */
export const CHECKOUT_SLOTS = 100;

/**
 * The slot this checkout owns, from where it is on disk.
 *
 * The path is the only thing that is both stable across runs and different
 * between worktrees. A pid would change every run; a branch name would collide
 * between two checkouts of the same branch and change under a rebase.
 */
export function checkoutSlot(root = ROOT) {
  const digest = createHash('sha256').update(path.resolve(root)).digest();
  return digest.readUInt16BE(0) % CHECKOUT_SLOTS;
}

export function lanePort(lane, root = ROOT) {
  const band = LANE_BANDS[lane];
  if (!band) throw new Error(`Unknown browser lane: ${lane}. Add it to LANE_BANDS with a band of its own.`);
  return band + checkoutSlot(root);
}

export function laneUrl(lane, root = ROOT) {
  return `http://${HOST}:${lanePort(lane, root)}`;
}

/** Is anybody listening? Asked by trying to be the listener. */
export function portIsFree(port, host = HOST) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code !== 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

/**
 * Refuse the run rather than test whatever is already there.
 *
 * Exits non-zero so the shell `&&` in the lane command stops before the dev
 * server starts. The message says what to do, because the honest answer is
 * usually "another session of your own is running" rather than "you did
 * something wrong".
 */
export async function assertPortFree(port, lane) {
  if (await portIsFree(port)) return;
  console.error(`The ${lane} browser lane cannot start: ${HOST}:${port} is already in use.`);
  console.error('This port is derived from this checkout\'s path, so something in *this* worktree is holding it —');
  console.error('usually a dev server or a Playwright run that did not shut down. Stop it and run the lane again.');
  console.error('The lane refuses rather than reusing it, because a server that merely answers is not the build under test.');
  process.exit(2);
}

/**
 * The shell the lane runs, with the refusal in front of the server.
 *
 * A guard expressed as a command rather than as config is what makes it apply
 * to `reuseExistingServer: false` — Playwright runs the command every time, so
 * the check happens every time.
 */
export function guardedCommand(lane, port, command) {
  const guard = `node --input-type=module -e "import {assertPortFree} from './tooling/lib/e2e-server.mjs'; await assertPortFree(${port}, '${lane}');"`;
  return `${guard} && ${command}`;
}

/**
 * The whole `webServer` block for a lane, so no config can half-adopt this.
 *
 * `reuseExistingServer` is not a parameter. A lane that could opt back into
 * reuse is a lane that can silently test another checkout again, and the point
 * of this module is that the option stopped being available.
 */
export function laneServer({ lane, command, env, timeout = 120_000, root = ROOT }) {
  const port = lanePort(lane, root);
  return {
    command: guardedCommand(lane, port, command),
    url: laneUrl(lane, root),
    reuseExistingServer: false,
    timeout,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    ...(env ? { env } : {}),
  };
}
