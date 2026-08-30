/**
 * The bounded serious-application benchmark, held still.
 *
 * `config/application-journey-benchmarks.json` states what a generated
 * application must be shown to do for one vertical slice. A frozen benchmark is
 * only worth freezing if it cannot quietly become easier, and the ways it gets
 * easier are all edits somebody makes for a good reason: a state added without
 * a way out of it, a post-lock refusal deleted because it was awkward to set
 * up, an isolation case whose competing identity is the actor themselves, a
 * settlement repeat that stops being a repeat.
 *
 * These rules are what the benchmark asserts about itself before any generated
 * application is measured against it. They are deliberately about the contract's
 * internal soundness rather than about a product: nothing here builds, runs or
 * inspects a generated application, because none exists yet. What they buy is
 * that the target the first build is measured against is total, non-vacuous and
 * free of the failure classes docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md
 * records — and that its domain never leaks into the factory.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));

const BENCHMARK_FILE = 'config/application-journey-benchmarks.json';
const SCHEMA_FILE = 'schemas/application-journey-benchmark.schema.json';
const benchmark = readJson(BENCHMARK_FILE).benchmark;

const scenariosOfKind = (kind) => benchmark.scenarios.filter((entry) => entry.kind === kind);
const scenario = (id) => benchmark.scenarios.find((entry) => entry.id === id) ?? null;

test('the frozen benchmark validates against its schema and names each scenario once', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson(SCHEMA_FILE));
  assert.ok(validate(benchmark), `benchmark is invalid: ${JSON.stringify(validate.errors)}`);

  const ids = benchmark.scenarios.map((entry) => entry.id);
  assert.deepEqual([...new Set(ids)], ids, 'two scenarios share an id, so one of them is unaddressable');

  const identities = new Set(benchmark.identities.map((entry) => entry.id));
  for (const entry of benchmark.scenarios) {
    assert.ok(identities.has(entry.actor), `scenario ${entry.id} acts as ${entry.actor}, which is not a declared identity`);
  }
});

// ---------------------------------------------------------------------------
// The lifecycle has to be a machine, not a drawing.
// ---------------------------------------------------------------------------

test('every lifecycle state is declared, reachable, and either terminal or has a way out', () => {
  const { initial, terminal, states, transitions } = benchmark.lifecycle;
  const declared = new Set(Object.keys(states));

  assert.ok(declared.has(initial), `the initial state ${initial} is not declared`);
  for (const state of terminal) assert.ok(declared.has(state), `terminal state ${state} is not declared`);

  for (const transition of transitions) {
    assert.ok(declared.has(transition.from), `${transition.trigger} leaves undeclared state ${transition.from}`);
    assert.ok(declared.has(transition.to), `${transition.trigger} enters undeclared state ${transition.to}`);
  }

  // Reachability, walked rather than asserted: an unreachable state is a rule
  // nothing can ever exercise, which reads as coverage and is not.
  const reached = new Set([initial]);
  for (let changed = true; changed;) {
    changed = false;
    for (const transition of transitions) {
      if (reached.has(transition.from) && !reached.has(transition.to)) {
        reached.add(transition.to);
        changed = true;
      }
    }
  }
  for (const state of declared) assert.ok(reached.has(state), `${state} cannot be reached from ${initial}`);

  const terminalStates = new Set(terminal);
  const outgoing = new Set(transitions.map((transition) => transition.from));
  for (const state of declared) {
    if (terminalStates.has(state)) {
      assert.ok(!outgoing.has(state), `${state} is terminal but something transitions out of it`);
    } else {
      assert.ok(outgoing.has(state), `${state} is not terminal and has no transition out of it, so the machine can wedge there`);
    }
  }
});

test('no transition a client could cause is left without an authority or a guard', () => {
  for (const transition of benchmark.lifecycle.transitions) {
    assert.ok(transition.guard, `${transition.trigger} declares no guard, so it is an assignment rather than a transition`);
    assert.ok(['server', 'official-source'].includes(transition.authority), `${transition.trigger} has no authority`);
  }
});

// ---------------------------------------------------------------------------
// The lock is the point of the benchmark, so it may not be proved vacuously.
// ---------------------------------------------------------------------------

test('the deadline is server-authoritative and closes a window that was demonstrably open', () => {
  assert.equal(benchmark.lock.authority, 'server');
  assert.equal(benchmark.lock.afterLockDecision, 'refused');

  const trigger = benchmark.lifecycle.transitions.find((entry) => entry.trigger === benchmark.lock.trigger);
  assert.ok(trigger, `the lock names trigger ${benchmark.lock.trigger}, which is not a lifecycle transition`);
  assert.equal(trigger.authority, 'server', 'a deadline the client evaluates is a suggestion');

  const decisions = scenariosOfKind('decision');
  const accepted = decisions.filter((entry) => entry.phase === 'pre-lock' && entry.expect === 'accepted');
  const refused = decisions.filter((entry) => entry.phase === 'locked' && entry.expect === 'refused');
  assert.ok(accepted.length > 0, 'nothing succeeds before the lock, so the refusal after it proves nothing');
  assert.ok(refused.length > 0, 'nothing is refused after the lock');

  // Same actor, same subject. A refusal for a different entity than the one that
  // was accepted is a refusal about something else.
  const comparable = refused.some((deny) => accepted.some((allow) => allow.actor === deny.actor && allow.subject === deny.subject));
  assert.ok(comparable, 'no post-lock refusal shares an actor and subject with a pre-lock acceptance, so the pair is not comparable');
});

// ---------------------------------------------------------------------------
// Isolation proved against yourself is proved against nothing.
// ---------------------------------------------------------------------------

test('isolation is asserted between two different identities over the same subject', () => {
  assert.ok(benchmark.identities.length >= 2, 'one identity cannot demonstrate isolation');

  const isolation = scenariosOfKind('isolation');
  assert.ok(isolation.length > 0, 'the benchmark asserts no isolation at all');

  const owned = benchmark.scenarios.filter((entry) => entry.kind === 'decision' && entry.expect === 'accepted');
  for (const entry of isolation) {
    assert.equal(entry.expect, 'refused', `isolation scenario ${entry.id} does not refuse anything`);
    const victim = owned.find((decision) => decision.subject === entry.subject && decision.actor !== entry.actor);
    assert.ok(victim, `isolation scenario ${entry.id} has no competing identity holding ${entry.subject}, so it would pass against an empty database`);
  }
});

// ---------------------------------------------------------------------------
// Settlement, and the difference between a provider's opinion and the truth.
// ---------------------------------------------------------------------------

test('a provisional result never settles and the official one does', () => {
  const { provisionalStatuses, officialStatus } = benchmark.officialResult;
  assert.ok(!provisionalStatuses.includes(officialStatus), 'the official status is also listed as provisional');

  const ingestion = scenariosOfKind('ingestion');
  assert.ok(ingestion.length > 0, 'no scenario feeds the external source at all');
  for (const entry of ingestion) {
    assert.ok(provisionalStatuses.includes(entry.resultStatus), `ingestion scenario ${entry.id} reports ${entry.resultStatus}, which is not a declared provisional status`);
    assert.equal(entry.expect, 'unchanged', `ingestion scenario ${entry.id} lets provisional data change the outcome`);
  }

  const settles = scenariosOfKind('settlement').filter((entry) => entry.expect === 'accepted');
  assert.ok(settles.length > 0, 'nothing ever settles, so the provisional refusal is not a distinction');
  for (const entry of settles) {
    assert.equal(entry.resultStatus, officialStatus, `settlement scenario ${entry.id} settles on ${entry.resultStatus} rather than the official status`);
  }
});

test('repeating a settlement is a repeat of one that happened, and changes nothing', () => {
  assert.equal(benchmark.settlement.idempotent, true);
  assert.ok(benchmark.settlement.identityKey.length > 0);

  const repeats = scenariosOfKind('settlement').filter((entry) => entry.repeatOf);
  assert.ok(repeats.length > 0, 'no scenario repeats a settlement, so idempotency is declared and never exercised');
  for (const entry of repeats) {
    const original = scenario(entry.repeatOf);
    assert.ok(original, `${entry.id} repeats ${entry.repeatOf}, which does not exist`);
    assert.equal(original.expect, 'accepted', `${entry.id} repeats a settlement that never succeeded`);
    assert.equal(entry.expect, 'unchanged', `${entry.id} repeats a settlement and expects something to change`);
    assert.equal(entry.subject, original.subject, `${entry.id} repeats a settlement for a different subject`);
    assert.equal(entry.actor, original.actor, `${entry.id} repeats a settlement for a different actor`);
  }
});

test('the leaderboard ordering cannot end in a tie', () => {
  const { orderBy, uniqueKey } = benchmark.leaderboard;
  const last = orderBy.at(-1);
  assert.equal(last.field, uniqueKey, 'the ordering chain does not end in the unique key, so two rows can tie and rank arbitrarily');
  assert.equal(scenariosOfKind('ranking').length > 0, true, 'nothing reads the leaderboard');
});

// ---------------------------------------------------------------------------
// The link between the frozen contract and the run that measures something.
// ---------------------------------------------------------------------------

const ACCEPTANCE_FILE = 'tooling/application-journey-benchmark-acceptance.sql';

test('every frozen scenario is executed by the benchmark acceptance, not merely declared', () => {
  // A contract nobody runs is a wish. The failure this prevents is quiet and
  // easy: a scenario that becomes awkward to set up gets dropped from the SQL,
  // the acceptance stays green because it no longer attempts it, and the
  // benchmark still lists it as though it were proved.
  const acceptance = fs.readFileSync(path.join(REPOSITORY_ROOT, ACCEPTANCE_FILE), 'utf8');
  const missing = benchmark.scenarios.filter((entry) => !acceptance.includes(`[${entry.id}]`)).map((entry) => entry.id);
  assert.deepEqual(missing, [], `frozen scenarios with no executed assertion in ${ACCEPTANCE_FILE}`);

  // And the reverse, because a tag for a scenario that no longer exists is a
  // test claiming to prove something the contract stopped asking for.
  const declared = new Set(benchmark.scenarios.map((entry) => entry.id));
  // Anchored on the opening quote of a test description. An unanchored `[...]`
  // also matches every `array[1]` in the file.
  const tagged = [...acceptance.matchAll(/'\[([a-z0-9-]+)\]/g)].map((match) => match[1]);
  const unknown = [...new Set(tagged)].filter((id) => !declared.has(id));
  assert.deepEqual(unknown, [], `${ACCEPTANCE_FILE} tags assertions with scenario ids the frozen benchmark does not declare`);
});

test('the executed acceptance asserts the refusal reasons the contract froze', () => {
  // The reasons are part of the contract, not commentary on it. A product that
  // refuses a late decision with a generic permissions error has satisfied the
  // scenario's `expect` and told the person nothing about what went wrong.
  const acceptance = fs.readFileSync(path.join(REPOSITORY_ROOT, ACCEPTANCE_FILE), 'utf8');
  const missing = benchmark.scenarios
    .filter((entry) => entry.expect === 'refused' && typeof entry.reason === 'string')
    .filter((entry) => !acceptance.includes(entry.reason))
    .map((entry) => entry.id);

  // The isolation refusals are the deliberate exception: they are enforced by
  // filtering the row away, so there is no error message to assert and there
  // must not be one. Distinguishing "not yours" from "no such row" is how one
  // competitor confirms another competitor's decision exists.
  const enforcedBySilence = new Set(scenariosOfKind('isolation').map((entry) => entry.id));
  assert.deepEqual(
    missing.filter((id) => !enforcedBySilence.has(id)),
    [],
    'a frozen refusal reason is never asserted, so the product could refuse for a different reason and still pass',
  );
});

// ---------------------------------------------------------------------------
// The benchmark rule: extract capability from the difficulty, do not hard-code
// the reference application.
// ---------------------------------------------------------------------------

test("the benchmark's domain vocabulary has not leaked into any factory surface", () => {
  const surfaces = ['config', 'recipes', 'schemas', 'packages', 'templates', 'adapters'];
  const skip = new Set(['node_modules', 'generated', 'dist', '.app-builder']);
  const exempt = new Set([BENCHMARK_FILE, SCHEMA_FILE]);

  const files = [];
  const walk = (relative) => {
    const absolute = path.join(REPOSITORY_ROOT, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.(json|js|mjs|ts|tsx|sql|md)$/.test(entry.name) && !exempt.has(next)) files.push(next);
    }
  };
  for (const surface of surfaces) walk(surface);
  assert.ok(files.length > 0, 'no factory surface was read, so this rule is checking nothing');

  const findings = [];
  for (const term of benchmark.domain.vocabulary) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    for (const file of files) {
      const text = fs.readFileSync(path.join(REPOSITORY_ROOT, file), 'utf8');
      if (pattern.test(text)) findings.push(`${file} contains the benchmark-domain term "${term}"`);
    }
  }
  assert.deepEqual(findings, [], 'the reference application has been hard-coded into a factory surface rather than having capability extracted from it');
});
