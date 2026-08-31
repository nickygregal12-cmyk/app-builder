import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CHECKOUT_SLOTS, LANE_BANDS, checkoutSlot, guardedCommand, lanePort, laneServer, laneUrl, portIsFree } from './lib/e2e-server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function playwrightConfigs() {
  return fs.readdirSync(ROOT).filter((entry) => /^playwright(\..+)?\.config\.ts$/.test(entry));
}

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * The defect this file exists for.
 *
 * Every Playwright config named a fixed port and set `reuseExistingServer` for
 * local runs, which together mean "whatever answers here is the product under
 * test". Several App Builder worktrees run on this machine at once, so on
 * 2026-08-31 a visual session's `npm run test:e2e` attached to another
 * worktree's Builder Console and reported seven failures about a build it had
 * never made. The generated-project lanes are worse than noisy: they photograph
 * a site and publish the pictures as an evidence packet for an independent
 * reviewer, so a packet could have been a claim about somebody else's business.
 */
test('no browser lane will reuse a server it did not start', () => {
  const configs = playwrightConfigs();
  assert.ok(configs.length >= 5, 'expected every root Playwright config to be discoverable by name');
  for (const config of configs) {
    const source = read(config);
    if (!/webServer\s*:/.test(source)) continue;
    assert.doesNotMatch(
      source,
      /reuseExistingServer:\s*(?!false)/,
      `${config} may reuse a server it did not start. A server that answers is not the build under test; use laneServer() from tooling/lib/e2e-server.mjs.`,
    );
    assert.match(
      source,
      /laneServer\(\{/,
      `${config} builds its own webServer block rather than using laneServer(), so it can drift back to a shared port.`,
    );
  }
});

/**
 * A fixed port is the other half of the same defect, so it is asserted
 * separately: a lane could adopt `laneServer` and still hard-code a number in
 * its `baseURL`, and the browser would then go somewhere the server is not.
 */
test('no browser lane hard-codes the port it talks to', () => {
  for (const config of playwrightConfigs()) {
    const source = read(config);
    if (!/webServer\s*:/.test(source)) continue;
    const code = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(
      code,
      /http:\/\/127\.0\.0\.1:\d+/,
      `${config} names a literal port. Two checkouts would then choose the same one; derive it with lanePort()/laneUrl().`,
    );
    assert.match(code, /laneUrl\(/, `${config} must take its baseURL from the lane rather than from a literal.`);
  }
});

test('two checkouts of App Builder never choose the same port, and one checkout always chooses the same one', () => {
  const a = '/home/someone/app-builder';
  const b = '/home/someone/app-builder-worktrees/other-session';
  assert.notEqual(checkoutSlot(a), checkoutSlot(b), 'two worktrees landed on one slot, which is the collision this exists to stop');
  assert.equal(checkoutSlot(a), checkoutSlot(a), 'the slot must be stable, or a failed run cannot be re-attached to');
  // Trailing separators and relative spellings are the same checkout.
  assert.equal(checkoutSlot('/home/someone/app-builder/'), checkoutSlot(a));
  assert.ok(checkoutSlot(a) >= 0 && checkoutSlot(a) < CHECKOUT_SLOTS);
});

test('every lane has a band of its own, so one checkout can run two lanes at once', () => {
  const bands = Object.values(LANE_BANDS);
  assert.equal(new Set(bands).size, bands.length, 'two lanes share a band; accessibility and generated-app both named 4373 before this');
  for (const band of bands) {
    // A band has to be wider than the number of checkouts it separates, or two
    // lanes overlap at the edges.
    assert.ok(bands.filter((other) => other !== band).every((other) => Math.abs(other - band) >= CHECKOUT_SLOTS), 'bands overlap');
  }
  // Nothing may land on the ports the factory itself uses.
  for (const lane of Object.keys(LANE_BANDS)) {
    for (const reserved of [4310, 5173]) {
      const port = lanePort(lane, '/any/checkout');
      assert.notEqual(port, reserved, `${lane} can collide with the operator's own stack on ${reserved}`);
    }
  }
});

test('the lane refuses before it spawns, rather than waiting for a URL to answer', async () => {
  const port = lanePort('portability', '/some/checkout');
  const command = guardedCommand('portability', port, 'echo started');
  assert.match(command, /assertPortFree\(\d+, 'portability'\)/, 'the guard must run as part of the command, so it runs on every attempt');
  assert.ok(command.indexOf('assertPortFree') < command.indexOf('echo started'), 'the check has to happen before the server starts; afterwards the port is legitimately taken');

  // And the probe itself tells the truth about a port that is held.
  const net = await import('node:net');
  const held = net.createServer();
  await new Promise((resolve) => held.listen(0, '127.0.0.1', resolve));
  const takenPort = held.address().port;
  assert.equal(await portIsFree(takenPort), false, 'a held port must read as held, or the guard never fires');
  await new Promise((resolve) => held.close(resolve));
  assert.equal(await portIsFree(takenPort), true, 'a released port must read as free, or every lane refuses for ever');
});

test('laneServer does not offer reuse as an option', () => {
  const server = laneServer({ lane: 'console-e2e', command: 'true' });
  assert.equal(server.reuseExistingServer, false);
  assert.equal(server.url, laneUrl('console-e2e'));
  // Passing it explicitly must not change it: the whole point is that the
  // option stopped being available to a caller.
  const forced = laneServer({ lane: 'console-e2e', command: 'true', reuseExistingServer: true });
  assert.equal(forced.reuseExistingServer, false, 'a caller could opt back into testing another checkout');
});
