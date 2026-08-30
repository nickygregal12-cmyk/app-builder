import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DECLARABLE_KINDS,
  HARNESS_DECLARATIONS,
  SIGNAL_CAP,
  classifySignal,
  findDeclaration,
  summariseJourneySignals,
} from './lib/browser-signals.mjs';
import { EXPECTED_JOURNEYS, buildPacket, flattenTests, reconcileJourneys } from './generated-app-journey-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = path.join(ROOT, 'tests/generated-app');

const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const specFiles = () => fs.readdirSync(SPECS).filter((entry) => entry.endsWith('.spec.ts'));

/**
 * The defect this file exists for.
 *
 * The generated-application journeys assert what is on the screen and never ask
 * the browser what it reported, so a journey could throw an uncaught exception,
 * log an error, lose a request and take a 500 from the API while every locator
 * it names stayed exactly where it was — and pass. The lane also published
 * nothing on a green run, so the one open criterion on the bounded
 * serious-application benchmark, that rendered product evidence receives
 * independent review, had no object to review.
 */

test('an uncaught exception can never be declared away', () => {
  assert.ok(!DECLARABLE_KINDS.includes('page-error'), 'page-error must not be declarable');

  // Not by convention: a declaration that reaches for it is refused where it
  // was written, rather than silently matching nothing.
  assert.throws(
    () => findDeclaration({ kind: 'page-error', text: 'boom' }, [{ id: 'nope', kinds: ['page-error'], match: {}, because: 'x' }]),
    /no declaration may excuse/,
  );

  // And the widest legal declaration set still gates it.
  const wide = [{ id: 'everything', kinds: [...DECLARABLE_KINDS], match: {}, because: 'as broad as a declaration can legally be' }];
  assert.equal(classifySignal({ kind: 'page-error', text: 'TypeError: x is not a function' }, wide).disposition, 'gated');
});

test('a console error fails the journey unless something declared it', () => {
  assert.equal(classifySignal({ kind: 'console-error', text: 'Failed to load resource' }, HARNESS_DECLARATIONS).disposition, 'gated');

  const declared = classifySignal(
    { kind: 'console-error', text: 'Failed to load resource' },
    [...HARNESS_DECLARATIONS, { id: 'journey-refusal', kinds: ['console-error'], match: { text: 'Failed to load' }, because: 'the journey provokes it' }],
  );
  assert.equal(declared.disposition, 'declared');
  assert.equal(declared.declaredBy, 'journey-refusal');
  assert.match(declared.because, /provokes/, 'the reason must travel with the signal it excused');
});

test('the harness declarations excuse the harness and nothing beside it', () => {
  const cases = [
    // The dev server answers an icon request the template never declared.
    [{ kind: 'http-error', url: 'http://127.0.0.1:4373/favicon.ico', status: 404 }, 'declared'],
    // The same status from the API is a product signal and stays gated.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/records?id=eq.1', status: 404 }, 'gated'],
    // A navigation the journey performed cancelled a request it had started.
    [{ kind: 'request-failed', url: 'http://127.0.0.1:4373/src/main.tsx', failure: 'net::ERR_ABORTED' }, 'declared'],
    // A request that genuinely never arrived is not that.
    [{ kind: 'request-failed', url: 'http://127.0.0.1:54321/rest/v1/records', failure: 'net::ERR_CONNECTION_REFUSED' }, 'gated'],
    // Vite re-optimising its dependency graph mid-session.
    [{ kind: 'http-error', url: 'http://127.0.0.1:4373/node_modules/.vite/deps/react.js', status: 504 }, 'declared'],
    // A gateway timeout from anything else is a real one.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/decisions', status: 504 }, 'gated'],
    // The API refusing a write is exactly what this gate is for.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/decisions', status: 403 }, 'gated'],
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/records', status: 500 }, 'gated'],
    // Chromium's own echo of a failed request. The request itself is gated
    // above; excusing the echo removes a duplicate and no coverage.
    [{ kind: 'console-error', text: 'Failed to load resource: the server responded with a status of 500 (Internal Server Error)' }, 'declared'],
    [{ kind: 'console-error', text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED' }, 'declared'],
    // A message the application wrote is not an echo of anything.
    [{ kind: 'console-error', text: 'Failed to load resources for the dashboard' }, 'gated'],
  ];
  for (const [signal, expected] of cases) {
    assert.equal(
      classifySignal(signal, HARNESS_DECLARATIONS).disposition,
      expected,
      `${signal.kind} ${signal.url} ${signal.status ?? signal.failure} should be ${expected}`,
    );
  }
});

test('every harness declaration says why, so the packet can publish the reason', () => {
  for (const declaration of HARNESS_DECLARATIONS) {
    assert.match(declaration.id, /^[a-z0-9-]+$/);
    assert.ok(declaration.kinds.length > 0, `${declaration.id} declares no kind`);
    assert.ok(declaration.because.length > 80, `${declaration.id} needs a reason a reviewer can weigh, not a label`);
    assert.ok(Object.keys(declaration.match).length > 0, `${declaration.id} matches everything of its kind, which is not a declaration`);
  }
});

test('a journey summary separates gated from declared and states truncation', () => {
  const signals = [
    { kind: 'page-error', text: 'boom' },
    { kind: 'http-error', url: '/favicon.ico', status: 404 },
    { kind: 'console-warning', text: 'React does not recognize the prop' },
  ];
  const summary = summariseJourneySignals(signals, HARNESS_DECLARATIONS);
  assert.equal(summary.counts.gated, 1);
  assert.equal(summary.counts.declared, 1);
  assert.equal(summary.counts.observed, 1);
  assert.equal(summary.clean, false);
  assert.equal(summary.truncated, null);
  assert.ok(summary.unusedDeclarations.includes('navigation-cancelled-request'), 'a declaration that did not fire is named, not dropped');

  const flood = Array.from({ length: SIGNAL_CAP + 5 }, () => ({ kind: 'console-error', text: 'loop' }));
  const capped = summariseJourneySignals(flood, HARNESS_DECLARATIONS);
  assert.equal(capped.signals.length, SIGNAL_CAP);
  assert.deepEqual(capped.truncated, { recorded: SIGNAL_CAP, emitted: SIGNAL_CAP + 5 });
});

test('no generated-application journey can opt out of being watched', () => {
  const files = specFiles();
  assert.ok(files.length >= 5, 'expected the generated-app journeys to be discoverable');

  for (const file of files) {
    const source = read(path.join('tests/generated-app', file));
    assert.match(
      source,
      /import \{[^}]*\btest\b[^}]*\} from '\.\/journey'/,
      `${file} must take its test from ./journey, or nothing watches what the browser reports while it runs.`,
    );
    // A type is not a runtime binding and cannot escape the fixture, so a
    // type-only import from the framework is still allowed.
    for (const [, names] of source.matchAll(/import \{([^}]*)\} from '@playwright\/test'/g)) {
      for (const name of names.split(',').map((entry) => entry.trim()).filter(Boolean)) {
        assert.match(name, /^type\s/, `${file} imports a runtime ${name} from @playwright/test, which bypasses the journey base.`);
      }
    }
  }
});

test('the lane publishes something on a green run', () => {
  const config = read('playwright.generated-app.config.ts');
  // `only-on-failure` is what left the CI evidence step uploading an empty
  // directory: the journeys worth reviewing are the ones that passed.
  assert.match(config, /screenshot:\s*'on'/, 'a passing journey must still be photographed, or independent review has no object');
  assert.match(config, /\['json',\s*\{\s*outputFile/, 'the run must leave a machine-readable record for the evidence packet to read');
});

test('the packet declares a development server and does not claim to depict what ships', () => {
  const packet = buildPacket({ report: { stats: { startTime: '2026-01-01T00:00:00Z' } }, tests: [], captureFiles: new Map() });
  assert.equal(packet.renderingSource.serverMode, 'development');
  assert.equal(packet.renderingSource.depictsShippingArtifact, false);
  assert.equal(packet.renderingSource.artifactHash, null);
  assert.match(packet.doesNotProve, /built artifact/);
});

test('a lane that lost a journey does not publish a complete packet', () => {
  const full = Object.entries(EXPECTED_JOURNEYS).flatMap(([file, count]) =>
    Array.from({ length: count }, (_, index) => ({ file, title: `${file} ${index}` })));
  assert.equal(reconcileJourneys(full).complete, true);

  const lost = full.filter((entry) => entry.file !== 'files.spec.ts' || !entry.title.endsWith('2'));
  const reconciled = reconcileJourneys(lost);
  assert.equal(reconciled.complete, false);
  assert.deepEqual(reconciled.missing, [{ file: 'files.spec.ts', expected: 3, ran: 2 }]);

  // A journey nobody expected is reported too. The packet must describe the run
  // it measured rather than the one it was written for.
  const added = reconcileJourneys(full.concat({ file: 'billing.spec.ts', title: 'new' }));
  assert.deepEqual(added.unexpected, [{ file: 'billing.spec.ts', expected: 0, ran: 1 }]);
});

test('the expected journey counts match the journeys that exist', () => {
  for (const file of specFiles()) {
    const source = read(path.join('tests/generated-app', file));
    const declared = (source.match(/^\s*test\(/gm) ?? []).length;
    assert.equal(
      EXPECTED_JOURNEYS[file],
      declared,
      `${file} declares ${declared} journey(ies) and the evidence packet expects ${EXPECTED_JOURNEYS[file]}. `
      + 'A packet that expects the wrong number cannot tell a lost journey from a new one.',
    );
  }
});

test('a Playwright report is flattened to the journeys it ran', () => {
  const report = {
    suites: [{
      file: 'tests/generated-app/records.spec.ts',
      suites: [{
        specs: [{ title: 'a contributor can see, create, edit and persist their organisation records', tests: [{ results: [{ status: 'passed', duration: 1200, attachments: [] }] }] }],
      }],
    }],
  };
  const tests = flattenTests(report);
  assert.equal(tests.length, 1);
  assert.equal(tests[0].file, 'records.spec.ts');
  assert.equal(tests[0].status, 'passed');
});
