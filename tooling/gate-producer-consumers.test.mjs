/**
 * Stage Q10 for the gate-producer registry.
 *
 * Every entry in `config/gate-producers.json` makes a claim about something
 * outside itself: a module that implements it, a contract it validates against,
 * a file it writes, a command that writes it, and a list of checks nothing
 * answers. Four of those five were prose when the registry landed — read as
 * true because they looked true, which is exactly the failure Q10 exists for
 * (`reviewBeforePublish`, `SectionSpec.variant` and `density` were each
 * declared before anything read them).
 *
 * So each one is checked against its consumer here. The last is the one worth
 * the most: `unregistered.checks` is a list of gaps, and a list of gaps that
 * drifts is worse than no list, because it reads as a survey.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const REGISTRY = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
const PIPELINES = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));
const SCRIPTS = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;

/** `tooling/lib/x.mjs auditThing + other` — a module path and the symbols it must export. */
function implementation(entry) {
  const [file, ...rest] = entry.implementation.split(/\s+/);
  return { file, symbols: rest.filter((token) => /^[A-Za-z_$][\w$]*$/.test(token)) };
}

test('every producer names a module that exists and exports what it claims', async () => {
  for (const producer of Object.values(REGISTRY.producers)) {
    const { file, symbols } = implementation(producer);
    assert.ok(fs.existsSync(file), `${producer.id} names implementation ${file}, which does not exist`);
    assert.ok(symbols.length > 0, `${producer.id} names no exported symbol in ${file}`);
    const module = await import(path.resolve(file));
    for (const symbol of symbols) {
      assert.equal(typeof module[symbol], 'function', `${file} does not export ${symbol}, which ${producer.id} says implements it`);
    }
  }
});

test('every producer names a contract and an artifact path that are real', () => {
  for (const producer of Object.values(REGISTRY.producers)) {
    assert.ok(fs.existsSync(producer.contract), `${producer.id} names contract ${producer.contract}, which does not exist`);
    assert.match(producer.artifact, /^\.app-builder\//, `${producer.id} writes outside the evidence directory`);
    assert.match(producer.artifact, /\.json$/, `${producer.id} must leave a machine-readable artifact`);
  }
});

test('every producer names a command somebody can actually run', () => {
  for (const producer of Object.values(REGISTRY.producers)) {
    const script = producer.command.replace(/^npm run /, '');
    assert.ok(Object.hasOwn(SCRIPTS, script), `${producer.id} names command ${producer.command}, which package.json does not define`);
  }
});

test('the command that collects evidence writes every artifact its own lane promises', () => {
  // The registry says where each artifact lands. `tooling/gate-evidence.mjs` is
  // what puts it there for its own lane, and it resolves the path from this
  // file — so the check that matters is that it publishes every producer that
  // lane owns, not that a string appears twice.
  //
  // Scoped by lane since a producer may belong to another one. A browser lane
  // builds and serves its own project; requiring gate-evidence.mjs to mention
  // it would be requiring one lane to write another lane's evidence, which is
  // the conflation this registry stopped making.
  const source = fs.readFileSync('tooling/gate-evidence.mjs', 'utf8');
  for (const [id, producer] of Object.entries(REGISTRY.producers)) {
    if (producer.lane !== 'gate-evidence') continue;
    assert.ok(source.includes(`'${id}'`), `gate-evidence.mjs never publishes producer ${id}, so its check can only ever be artifact-missing`);
  }
});

test('a producer outside the gate-evidence lane is run by a command CI actually invokes', () => {
  // Its artifact has to come from somewhere. A producer in its own lane whose
  // command nothing runs is registered evidence that can only ever be missing,
  // which is worse than leaving the check unanswered and honest.
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const producer of Object.values(REGISTRY.producers)) {
    if (producer.lane === 'gate-evidence') continue;
    assert.ok(
      workflow.includes(producer.command),
      `${producer.id} is in the ${producer.lane} lane and CI never runs ${producer.command}, so its artifact would never exist`,
    );
  }
});

test('ordinary CI invokes the integrated producer, resolver and convergence command', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /run: npm run gates:evidence/);
});

test('the list of unanswered checks is exactly the checks nothing answers', () => {
  const declared = new Set(Object.values(PIPELINES.gates).flatMap((gate) => gate.deterministicChecks ?? []));
  const answered = new Set(Object.keys(REGISTRY.checks));
  const expected = [...declared].filter((check) => !answered.has(check)).sort();
  const recorded = [...(REGISTRY.unregistered?.checks ?? [])].sort();

  assert.deepEqual(recorded, expected,
    'unregistered.checks must be exactly the declared checks with no producer — a list of gaps that drifts reads as a survey');

  // And nothing is both answered and listed as unanswered.
  for (const check of recorded) assert.ok(!answered.has(check), `${check} is both registered and listed as unregistered`);
  // Every answered check is one some gate declares; assertProducerRegistry
  // enforces that too, and this states it against the pipeline registry
  // directly so the two cannot agree with each other while both being wrong.
  for (const check of answered) assert.ok(declared.has(check), `${check} has a producer but no gate declares it`);
});

test('the registry accounts for every deterministic check in the repository, one way or the other', () => {
  const declared = [...new Set(Object.values(PIPELINES.gates).flatMap((gate) => gate.deterministicChecks ?? []))].sort();
  const accounted = [...new Set([...Object.keys(REGISTRY.checks), ...(REGISTRY.unregistered?.checks ?? [])])].sort();
  assert.deepEqual(accounted, declared,
    'a check that is neither answered nor recorded as unanswered is a gap nobody knows about');
  assert.ok(declared.length >= 10, `only ${declared.length} deterministic checks were found, which is too few to be the real set`);
});
