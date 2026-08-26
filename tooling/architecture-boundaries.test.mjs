import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  checkArchitecture,
  extractSpecifiers,
  findCycle,
  resolveTarget,
  violationsOf,
} from './architecture-boundaries.mjs';

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(root, 'config/architecture-boundaries.json'), 'utf8'));

test('the repository obeys every declared architecture boundary and stays cycle-free', () => {
  const { violations, cycle, edges } = checkArchitecture();
  assert.deepEqual(
    violations.map((v) => `${v.rule}: ${v.file} -> ${v.specifier}`),
    [],
    'architecture boundary violations',
  );
  assert.equal(cycle, null, `zone cycle: ${cycle?.join(' -> ')}`);
  assert.ok(edges.length > 0, 'a gate that observes no edges cannot be enforcing anything');
});

test('specifier extraction reads real imports and ignores prose that merely names a package', () => {
  const found = extractSpecifiers(`
    import { a } from '@app-builder/contracts';
    import './side-effect.css';
    const b = await import('@app-builder/control-plane');
    const c = require('../lib/thing.mjs');
    export { d } from './local.js';
    // This comment mentions @app-builder/service but imports nothing.
    const note = 'generated apps never depend on @app-builder/factory-core';
  `);
  assert.ok(found.includes('@app-builder/contracts'));
  assert.ok(found.includes('./side-effect.css'));
  assert.ok(found.includes('@app-builder/control-plane'));
  assert.ok(found.includes('../lib/thing.mjs'));
  assert.ok(found.includes('./local.js'));
  assert.ok(!found.includes('@app-builder/service'), 'a comment is not an import');
  assert.ok(!found.includes('@app-builder/factory-core'), 'prose in a string is not an import');
});

test('a deep relative path cannot dodge a package-name rule', () => {
  const resolved = resolveTarget(
    '../../../../apps/service/src/store.js',
    'templates/react-vite-neutral/files/src/app.ts',
  );
  assert.equal(resolved.kind, 'path');
  assert.equal(resolved.zone, 'service', 'a relative escape must resolve back to the zone it reaches');
});

test('a package specifier resolves to its zone, including subpath exports', () => {
  assert.equal(resolveTarget('@app-builder/control-plane', 'apps/console/src/App.tsx').zone, 'control-plane');
  assert.equal(resolveTarget('@app-builder/control-plane/roles', 'apps/console/src/App.tsx').zone, 'control-plane');
  assert.equal(resolveTarget('node:fs', 'apps/console/src/App.tsx'), null);
  assert.equal(resolveTarget('react', 'apps/console/src/App.tsx'), null, 'external packages are not this gate’s question');
});

test('the longest matching path prefix wins, so tooling/lib is not the tooling CLI', () => {
  assert.equal(resolveTarget('../../../tooling/lib/manifest.mjs', 'apps/service/src/x.js').zone, 'tooling-lib');
  assert.equal(resolveTarget('../../../tooling/doctor.mjs', 'apps/service/src/x.js').zone, 'tooling-cli');
  assert.equal(
    resolveTarget('../../tooling/lib/manifest.mjs', 'apps/service/src/x.js').zone,
    null,
    'a path that lands outside every zone is not silently attributed to one',
  );
});

test('a forbidden edge is reported with its rule and reason', () => {
  const edges = [
    { from: 'generated', to: 'control-plane', file: 'templates/x/files/src/a.ts', specifier: '@app-builder/control-plane' },
    { from: 'generated', to: 'contracts', file: 'templates/x/files/src/b.ts', specifier: '@app-builder/contracts' },
    { from: 'console', to: 'contracts', file: 'apps/console/src/App.tsx', specifier: '@app-builder/contracts' },
  ];
  const violations = violationsOf(edges);
  assert.equal(violations.length, 2, 'both generated-output edges are illegal; the Console contracts edge is not');
  assert.ok(violations.every((v) => v.rule === 'generated-output-stays-portable'));
  assert.ok(violations.every((v) => v.reason.length > 0), 'a violation must explain itself');
});

test('the permitted Console couplings stay permitted and the forbidden ones do not', () => {
  const permitted = violationsOf([
    { from: 'console', to: 'factory-core', file: 'apps/console/src/ConsoleRoot.tsx', specifier: '@app-builder/factory-core' },
  ]);
  assert.deepEqual(permitted, [], 'deterministic intake helpers are a documented, permitted coupling');

  const forbidden = violationsOf([
    { from: 'console', to: 'content-intelligence', file: 'apps/console/src/App.tsx', specifier: '@app-builder/content-intelligence' },
  ]);
  assert.equal(forbidden.length, 1, 'the Console must reach ingestion through the service');
});

test('the parser fails closed: fixture import syntax counts as an edge', () => {
  // This file is proof of the behaviour: its own fixtures above contain example specifiers, and the
  // gate reads them as edges. That is intentional — over-reporting is recoverable, a missed illegal
  // edge is not. Fixtures needing forbidden specifiers belong in tooling-cli, which is unconstrained.
  const found = extractSpecifiers(`const fixture = \`import x from '@app-builder/control-plane'\`;`);
  assert.ok(
    found.includes('@app-builder/control-plane'),
    'a specifier inside a fixture string is still reported, so the gate never misses a real edge',
  );
});

test('a cycle between zones is detected', () => {
  assert.deepEqual(
    findCycle([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]),
    ['a', 'b', 'c', 'a'],
  );
  assert.equal(findCycle([{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]), null);
});

test('every boundary names a real zone, and every zone path exists', () => {
  const zoneIds = new Set(Object.keys(registry.zones));
  for (const boundary of registry.boundaries) {
    assert.ok(zoneIds.has(boundary.from), `boundary ${boundary.id} names unknown zone ${boundary.from}`);
    assert.ok(boundary.reason?.length > 0, `boundary ${boundary.id} must explain itself`);
    for (const zone of boundary.forbidZones) {
      assert.ok(zoneIds.has(zone), `boundary ${boundary.id} forbids unknown zone ${zone}`);
      assert.notEqual(zone, boundary.from, `boundary ${boundary.id} forbids its own zone`);
    }
  }
  for (const [id, zone] of Object.entries(registry.zones)) {
    for (const prefix of zone.paths) {
      assert.ok(fs.existsSync(path.join(root, prefix)), `zone ${id} points at missing path ${prefix}`);
    }
  }
});
