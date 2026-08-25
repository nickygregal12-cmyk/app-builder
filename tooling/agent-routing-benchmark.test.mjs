import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  buildRoutingPacket,
  evaluateBenchmarkCase,
  matchTaskRoutes,
} from '../packages/control-plane/src/routing.js';

const root = process.cwd();

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

const routing = readJson('config/agent-routing.json');
const benchmarks = readJson('config/agent-routing-benchmarks.json');
const roles = readJson('config/agent-roles.json').roles;
const skills = readJson('config/skill-registry.json').skills;

test('every benchmark case validates against the RoutingBenchmarkCase schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson('schemas/routing-benchmark-case.schema.json'));
  const ids = new Set();
  for (const benchmarkCase of benchmarks.cases) {
    assert.ok(validate(benchmarkCase), `case ${benchmarkCase.id} is invalid: ${JSON.stringify(validate.errors)}`);
    assert.ok(!ids.has(benchmarkCase.id), `duplicate benchmark case id ${benchmarkCase.id}`);
    ids.add(benchmarkCase.id);
  }
});

test('task routes reference real roles, skills, context routes and authority files', () => {
  const ids = new Set();
  for (const route of routing.taskRoutes) {
    assert.ok(!ids.has(route.id), `duplicate task route id ${route.id}`);
    ids.add(route.id);
    assert.ok(route.keywords.length > 0, `task route ${route.id} matches nothing`);
    assert.ok(routing.routes[route.contextRoute], `task route ${route.id} names unknown context route ${route.contextRoute}`);
    for (const role of route.roles) {
      assert.ok(roles[role], `task route ${route.id} names unknown role ${role}`);
    }
    for (const skill of route.skills) {
      assert.ok(skills[skill], `task route ${route.id} names unregistered skill ${skill}`);
    }
    for (const authority of route.authorities) {
      assert.ok(fs.existsSync(path.join(root, authority)), `task route ${route.id} points at missing authority ${authority}`);
    }
    assert.ok(
      route.authorities.length <= routing.packet.maxAuthorities,
      `task route ${route.id} alone exceeds the authority ceiling`,
    );
  }
});

test('an authored task route already respects the skill load budget on its own', () => {
  for (const route of routing.taskRoutes) {
    const loaded = {};
    for (const skill of route.skills) {
      const loadClass = skills[skill].loadClass;
      loaded[loadClass] = (loaded[loadClass] ?? 0) + 1;
    }
    for (const [loadClass, count] of Object.entries(loaded)) {
      assert.ok(
        count <= routing.skillLoadBudget[loadClass],
        `task route ${route.id} loads ${count} competing ${loadClass} skills`,
      );
    }
    assert.ok(
      route.skills.length <= routing.packet.maxSelectedSkills,
      `task route ${route.id} exceeds the selected-skill ceiling before any merge`,
    );
  }
});

test('every benchmark case routes exactly as specified, positively and negatively', () => {
  const failures = [];
  for (const benchmarkCase of benchmarks.cases) {
    const result = evaluateBenchmarkCase(benchmarkCase, { routing, skills });
    for (const failure of result.failures) failures.push(`${benchmarkCase.id}: ${failure}`);
  }
  assert.deepEqual(failures, [], `routing benchmark failures:\n${failures.join('\n')}`);
});

test('an unclassifiable prompt orients rather than guessing a specialist', () => {
  const packet = buildRoutingPacket('Refactor this component', { routing, skills });
  assert.equal(packet.unclassified, true);
  assert.deepEqual(packet.roles, []);
  assert.deepEqual(packet.skills, []);
  assert.equal(packet.contextRoute, null);
  assert.match(packet.nextStep, /bounded repository orientation/);
});

test('keyword matching is whole-phrase, so cheap words do not fire expensive routes', () => {
  assert.deepEqual(matchTaskRoutes('Look at the debugging output', routing.taskRoutes).map((r) => r.id), []);
  assert.deepEqual(matchTaskRoutes('Plan a trip to Seoul', routing.taskRoutes).map((r) => r.id), []);
  assert.ok(matchTaskRoutes('There is a bug here', routing.taskRoutes).some((r) => r.id === 'systematic-defect'));
});

test('merged multi-route packets stay inside every first-orientation ceiling', () => {
  const packet = buildRoutingPacket(
    'The signup bug means the empty state is wrong, the seo metadata is stale and we should improve the copy',
    { routing, skills },
  );
  assert.ok(packet.matchedRoutes.length > 1, 'this prompt should match several routes');
  assert.ok(packet.roles.length <= routing.packet.maxSelectedRoles);
  assert.ok(packet.skills.length <= routing.packet.maxSelectedSkills);
  assert.ok(packet.authorities.length <= routing.packet.maxAuthorities);
  assert.ok(packet.suppressed.length > 0, 'a merge that hits a ceiling must record what it suppressed');
  assert.ok(
    Buffer.byteLength(JSON.stringify(packet), 'utf8') <= routing.packet.maxPacketBytes,
    'the deterministic packet must stay under the byte ceiling',
  );
});

test('the highest-priority matching route owns the context ceiling', () => {
  const packet = buildRoutingPacket('Promote to production after fixing the signup bug', { routing, skills });
  assert.equal(packet.matchedRoutes[0], 'environment-mutation');
  assert.equal(packet.contextRoute, 'review');
  assert.equal(packet.contextCeilingTokens, routing.routes.review.maxTokens);
});

test('every role a benchmark case forbids is a real role', () => {
  for (const benchmarkCase of benchmarks.cases) {
    for (const role of benchmarkCase.forbiddenRoles ?? []) {
      assert.ok(roles[role], `case ${benchmarkCase.id} forbids unknown role ${role}`);
    }
    for (const skill of benchmarkCase.forbiddenSkills ?? []) {
      assert.ok(skills[skill], `case ${benchmarkCase.id} forbids unregistered skill ${skill}`);
    }
  }
});
