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
  isMutation,
  retryViolatesMutation,
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
    // The local stack's own clock race, matched on the PostgREST code and not
    // on the status. This is what the first hosted run of the gate actually
    // found behind `HTTP 401` on a profile write.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/profiles?on_conflict=id', status: 401, body: '{"code":"PGRST303","details":null,"hint":null,"message":"JWT issued at future"}' }, 'declared'],
    // Any other 401 on the same address is a product signal and stays gated.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/profiles?on_conflict=id', status: 401, body: '{"code":"PGRST301","message":"JWT expired"}' }, 'gated'],
    // And a 401 whose body never arrived cannot be excused by a body rule.
    [{ kind: 'http-error', url: 'http://127.0.0.1:54321/rest/v1/profiles', status: 401 }, 'gated'],
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

/**
 * The retry rule, and why it is about the write rather than the outcome.
 *
 * A journey that wrote and was then rerun did not start where the seed put it.
 * Both attempts passing is not a defence: the second one still began somewhere
 * the seed never described, so its pass is not evidence about the journey the
 * seed set up.
 */
test('a retry after a successful write is refused whatever the outcome', () => {
  const wrote = [{ method: 'POST', url: '/rest/v1/records', status: 201 }];

  assert.equal(retryViolatesMutation([{ mutations: wrote }]), false, 'one attempt is never a violation');
  assert.equal(retryViolatesMutation([{ mutations: [] }, { mutations: [] }]), false, 'a read-only journey may be retried');
  assert.equal(
    retryViolatesMutation([{ mutations: wrote, status: 'failed' }, { mutations: [], status: 'passed' }]),
    true,
    'the classic laundering case: wrote, failed, retried, green',
  );
  assert.equal(
    retryViolatesMutation([{ mutations: wrote, status: 'passed' }, { mutations: wrote, status: 'passed' }]),
    true,
    'both attempts passing does not make the second one evidence about the seeded state',
  );

  // A write the server refused changed nothing, so it cannot poison a retry.
  // This is what keeps the rule usable rather than a blanket ban: journeys that
  // deliberately provoke a refusal stay retryable.
  assert.equal(isMutation({ method: 'POST', status: 403 }), false);
  assert.equal(isMutation({ method: 'POST', status: 409 }), false);
  assert.equal(isMutation({ method: 'GET', status: 200 }), false);
  assert.equal(isMutation({ method: 'POST', status: 201 }), true);
  assert.equal(isMutation({ method: 'PATCH', status: 204 }), true);
  assert.equal(isMutation({ method: 'DELETE', status: 200 }), true);
});

test('the packet refuses a run in which a mutating journey was retried', () => {
  const attach = (mutations) => ({
    name: 'browser-signals',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ counts: { gated: 0, declared: 0, observed: 0 }, clean: true, signals: [], mutations })).toString('base64'),
  });
  const report = {
    suites: [{
      file: 'tests/generated-app/records.spec.ts',
      suites: [{
        specs: [{
          title: 'a contributor can see, create, edit and persist their organisation records',
          tests: [{ results: [
            { status: 'failed', attachments: [attach([{ method: 'POST', url: '/rest/v1/records', status: 201 }])] },
            { status: 'passed', attachments: [attach([])] },
          ] }],
        }],
      }],
    }],
  };
  const packet = buildPacket({ report, tests: flattenTests(report), captureFiles: new Map() });
  const journey = packet.journeys[0];
  assert.equal(journey.mutated, true);
  assert.equal(journey.retriedAfterMutation, true);
  assert.equal(journey.outcome, 'flaky-pass', 'a pass that needed two goes is not a first-attempt pass');
  assert.deepEqual(packet.signals.retriedAfterMutation, [journey.journey]);
});

test('a first-attempt pass and a flaky pass are different outcomes in the packet', () => {
  const clean = { name: 'browser-signals', contentType: 'application/json', body: Buffer.from(JSON.stringify({ counts: { gated: 0, declared: 0, observed: 0 }, clean: true, signals: [], mutations: [] })).toString('base64') };
  const build = (results) => {
    const report = { suites: [{ file: 'tests/generated-app/admin.spec.ts', suites: [{ specs: [{ title: 'x', tests: [{ results }] }] }] }] };
    return buildPacket({ report, tests: flattenTests(report), captureFiles: new Map() }).journeys[0];
  };
  assert.equal(build([{ status: 'passed', attachments: [clean] }]).outcome, 'passed');
  assert.equal(build([{ status: 'failed', attachments: [clean] }, { status: 'passed', attachments: [clean] }]).outcome, 'flaky-pass');
});

/**
 * The configuration and the rule must not be able to drift apart. The comment
 * in the config explains why the number is zero; this is what notices when
 * somebody changes it back without providing the reset that would justify it.
 */
test('the mutating lane does not retry', () => {
  const config = read('playwright.generated-app.config.ts');
  assert.match(
    config,
    /^\s*retries: 0,\s*$/m,
    'every journey in this lane writes, and the seed runs once before Playwright starts, so a second attempt does not start where the seed put it.',
  );
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
  assert.equal(tests[0].attempts.length, 1);
});

/**
 * The defect the first hosted run of this gate exposed in this file's own
 * assembler. Three journeys reported errors on their first attempt, two passed
 * on retry, and a packet built from `results.at(-1)` described a clean run while
 * the job was red.
 */
test('a retry does not launder what the attempt before it reported', () => {
  const signals = (gated) => ({
    body: Buffer.from(JSON.stringify({ counts: { gated, declared: 0, observed: 0 }, clean: gated === 0, signals: Array.from({ length: gated }, () => ({ kind: 'http-error', disposition: 'gated' })) })).toString('base64'),
    name: 'browser-signals',
    contentType: 'application/json',
  });
  const report = {
    suites: [{
      file: 'tests/generated-app/admin.spec.ts',
      suites: [{
        specs: [{
          title: 'a platform administrator reaches the real generated admin consumer',
          tests: [{ results: [
            { status: 'failed', duration: 900, attachments: [signals(1)] },
            { status: 'passed', duration: 800, attachments: [signals(0)] },
          ] }],
        }],
      }],
    }],
  };
  const tests = flattenTests(report);
  assert.equal(tests[0].attempts.length, 2, 'both attempts must survive into the packet');

  const packet = buildPacket({ report, tests, captureFiles: new Map() });
  const journey = packet.journeys[0];
  assert.equal(journey.status, 'passed', 'Playwright called this a flaky pass and the packet does not argue with that');
  assert.equal(journey.maskedByRetry, true, 'but it must say the earlier attempt reported something');
  assert.equal(packet.signals.byKind['http-error'].gated, 1, 'the error is counted, not dropped with the attempt that saw it');
  assert.deepEqual(packet.signals.maskedByRetry, ['a platform administrator reaches the real generated admin consumer']);
});
