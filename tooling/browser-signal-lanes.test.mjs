import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEV_SERVER_DECLARATIONS, HARNESS_DECLARATIONS, SUPABASE_LOCAL_DECLARATIONS } from './lib/browser-signals.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

/**
 * Which lanes have been asked what the browser saw, and why each one needs to be.
 *
 * A lane belongs here when its claim would be false of a page that threw. That
 * is a judgement about the claim rather than about the technology, which is why
 * the reason is written down: the next person deciding whether to add a lane
 * should be answering the same question rather than copying a pattern.
 */
const INSTRUMENTED_LANES = Object.freeze([
  Object.freeze({
    dir: 'tests/generated-app',
    base: 'tests/generated-app/journey.ts',
    readOnly: false,
    claim: 'a person can use the generated product against a real Supabase stack',
  }),
  Object.freeze({
    dir: 'tests/accessibility',
    base: 'tests/accessibility/journey.ts',
    readOnly: true,
    claim: 'the generated marketing app has no serious or critical WCAG violations — which axe reads off a DOM that an exception leaves standing',
  }),
  Object.freeze({
    dir: 'tests/real-business',
    base: 'tests/real-business/journey.ts',
    readOnly: true,
    claim: 'a source pack becomes a navigable source-backed standalone website, which a required asset answering 500 makes false',
  }),
]);

/**
 * Lanes deliberately left alone, with the reason.
 *
 * Recorded rather than omitted. A lane missing from both lists is an
 * unconsidered lane, and the point of this file is that the decision was made
 * rather than defaulted.
 */
const UNINSTRUMENTED_LANES = Object.freeze([
  Object.freeze({
    config: 'playwright.config.ts',
    reason:
      'The Builder Console lane drives the factory\'s own interface, not a generated product. Its claim does depend on a clean '
      + 'browser and it is a genuine candidate, but it also drives a long-lived local service whose ordinary signals have never '
      + 'been catalogued, so instrumenting it is its own slice rather than a line added here.',
  }),
  Object.freeze({
    config: 'playwright.portability.config.ts',
    reason:
      'The cross-browser lane is the strongest remaining candidate — "renders in four engines" is exactly the claim a console '
      + 'error refutes — but Firefox and WebKit have their own ordinary noise, and adopting it here would mean declaring three '
      + 'baselines nobody has measured. Doing that blind is how an allowlist gets written to make a build go green.',
  }),
]);

test('every lane that makes a claim about a rendered product is instrumented, or says why not', () => {
  const configs = fs.readdirSync(ROOT).filter((entry) => /^playwright(\..+)?\.config\.ts$/.test(entry));
  const accounted = new Set(UNINSTRUMENTED_LANES.map((lane) => lane.config));
  for (const lane of INSTRUMENTED_LANES) {
    const testDir = lane.dir.replace(/^tests\//, '');
    const owning = configs.find((config) => new RegExp(`testDir:\\s*'\\./tests/${testDir}'`).test(read(config)));
    assert.ok(owning, `no Playwright config runs ${lane.dir}`);
    accounted.add(owning);
  }
  const unaccounted = configs.filter((config) => !accounted.has(config));
  assert.deepEqual(unaccounted, [], `these lanes are neither instrumented nor explained: ${unaccounted.join(', ')}`);
});

test('no spec in an instrumented lane can opt out of being watched', () => {
  for (const lane of INSTRUMENTED_LANES) {
    const specs = fs.readdirSync(path.join(ROOT, lane.dir)).filter((entry) => entry.endsWith('.spec.ts'));
    assert.ok(specs.length > 0, `${lane.dir} has no specs`);
    for (const spec of specs) {
      const source = read(path.join(lane.dir, spec));
      assert.match(
        source,
        /import \{[^}]*\btest\b[^}]*\} from '\.\/journey'/,
        `${lane.dir}/${spec} must take its test from ./journey, or nothing watches what the browser reports while it runs.`,
      );
      // A type is not a runtime binding and cannot escape the fixture.
      for (const [, names] of source.matchAll(/import \{([^}]*)\} from '@playwright\/test'/g)) {
        for (const name of names.split(',').map((entry) => entry.trim()).filter(Boolean)) {
          assert.match(name, /^type\s/, `${lane.dir}/${spec} imports a runtime ${name} from @playwright/test, bypassing the lane base.`);
        }
      }
    }
  }
});

test('every lane base uses the shared mechanism rather than its own copy', () => {
  for (const lane of INSTRUMENTED_LANES) {
    const source = read(lane.base);
    assert.match(source, /withBrowserSignals\(/, `${lane.base} must extend the shared fixture`);
    assert.match(source, /from '\.\.\/support\/browser-signals'/, `${lane.base} must import the one implementation`);
    // The failure this guards against is a lane that copied the listener block
    // and then drifted — a second `page.on('pageerror')` in the tree means two
    // definitions of what counts as a signal.
    assert.doesNotMatch(source, /page\.on\(/, `${lane.base} defines its own listeners instead of reusing the shared ones`);
  }
});

test('a read-only lane is declared read-only, and a mutating lane is not', () => {
  for (const lane of INSTRUMENTED_LANES) {
    const source = read(lane.base);
    if (lane.readOnly) {
      assert.match(source, /readOnly:\s*true/, `${lane.base} is read-only and must say so, because that is why its retries are safe`);
    } else {
      assert.doesNotMatch(source, /readOnly:\s*true/, `${lane.base} writes and must not claim otherwise`);
    }
  }
});

test('a lane takes only the declarations that apply to what runs in front of it', () => {
  const ids = (set) => set.map((entry) => entry.id);

  // The generated-app lane has a database in front of it; the static lanes do
  // not. A marketing lane carrying a PostgREST excuse would be claiming to have
  // considered something it never encounters.
  assert.deepEqual(ids(HARNESS_DECLARATIONS), [...ids(DEV_SERVER_DECLARATIONS), ...ids(SUPABASE_LOCAL_DECLARATIONS)]);
  assert.ok(ids(SUPABASE_LOCAL_DECLARATIONS).includes('supabase-local-jwt-clock-skew'));
  assert.ok(!ids(DEV_SERVER_DECLARATIONS).includes('supabase-local-jwt-clock-skew'));

  assert.match(read('tests/accessibility/journey.ts'), /DEV_SERVER_DECLARATIONS/);
  assert.match(read('tests/real-business/journey.ts'), /DEV_SERVER_DECLARATIONS/);
  assert.match(read('tests/generated-app/journey.ts'), /HARNESS_DECLARATIONS/);
});

test('a lane left uninstrumented gives a reason someone can disagree with', () => {
  for (const lane of UNINSTRUMENTED_LANES) {
    assert.ok(fs.existsSync(path.join(ROOT, lane.config)), `${lane.config} is listed but does not exist`);
    assert.ok(lane.reason.length > 120, `${lane.config} needs a reason, not a label`);
  }
});
