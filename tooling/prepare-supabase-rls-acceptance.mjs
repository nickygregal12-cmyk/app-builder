#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const generatedRoot = path.resolve('.tmp/generated-acceptance-b2b-saas');
const schemaRoot = path.join(generatedRoot, 'supabase', 'schema');
const benchmarkRoot = path.resolve('.tmp/generated-acceptance-journey-benchmark');
const benchmarkSchemaRoot = path.join(benchmarkRoot, 'supabase', 'schema');
const acceptanceRoot = path.resolve('.tmp/supabase-rls-acceptance');
const supabaseRoot = path.join(acceptanceRoot, 'supabase');
const migrationsRoot = path.join(supabaseRoot, 'migrations');
const testsRoot = path.join(supabaseRoot, 'tests', 'database');

if (!fs.existsSync(path.join(supabaseRoot, 'config.toml'))) {
  throw new Error('Supabase acceptance project is not initialized. Run pinned `supabase init` first.');
}
if (!fs.existsSync(schemaRoot)) {
  throw new Error('Canonical B2B SaaS project has not been generated. Run `npm run generate:acceptance` first.');
}

const fragments = fs.readdirSync(schemaRoot).filter((name) => name.endsWith('.sql')).sort();
if (!fragments.some((name) => name.includes('-profiles-'))) throw new Error('Generated B2B SaaS acceptance app is missing the profiles database recipe.');
if (!fragments.some((name) => name.includes('-organisations-'))) throw new Error('Generated B2B SaaS acceptance app is missing the organisations database recipe.');

fs.mkdirSync(migrationsRoot, { recursive: true });
fs.mkdirSync(testsRoot, { recursive: true });
for (const name of fs.readdirSync(migrationsRoot)) fs.rmSync(path.join(migrationsRoot, name), { recursive: true, force: true });
for (const name of fs.readdirSync(testsRoot)) fs.rmSync(path.join(testsRoot, name), { recursive: true, force: true });

/*
 * The bounded serious-application benchmark's extra capability.
 *
 * The benchmark project is the B2B SaaS acceptance project plus
 * `scheduled-decisions`, so everything it shares with the project above is
 * already in the migration and re-applying it would fail on the first
 * `create policy`. Only the fragments this project has and that one does not
 * are appended — which is the one recipe under test, taken from GENERATED
 * output. Reading the recipe's own SQL instead would prove the recipe is
 * well written and prove nothing about whether the factory installs it.
 */
if (!fs.existsSync(benchmarkSchemaRoot)) {
  throw new Error('The application-journey benchmark project has not been generated. Run `npm run generate:acceptance` first.');
}
// Fragment names are `<order>-<recipe>-<file>.sql`, and the order differs
// between two projects that install different sets. Dropping the ordering
// prefix leaves a name that identifies the fragment rather than its position.
const fragmentKey = (name) => name.replace(/^\d+-/, '');
const alreadyInstalled = new Set(fragments.map(fragmentKey));
const benchmarkFragments = fs.readdirSync(benchmarkSchemaRoot)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .filter((name) => !alreadyInstalled.has(fragmentKey(name)));
if (!benchmarkFragments.some((name) => name.includes('-scheduled-decisions-'))) {
  throw new Error('The benchmark project contributed no scheduled-decisions schema, so the journey acceptance would run against nothing.');
}

const migration = [
  '-- Generated only for executable recipe security acceptance. Do not treat this as a product migration.',
  'create extension if not exists pgtap with schema extensions;',
  ...fragments.flatMap((name) => [
    `\n-- source: ${path.posix.join('supabase/schema', name)}`,
    fs.readFileSync(path.join(schemaRoot, name), 'utf8').trim(),
  ]),
  ...benchmarkFragments.flatMap((name) => [
    `\n-- source: ${path.posix.join('.tmp/generated-acceptance-journey-benchmark/supabase/schema', name)}`,
    fs.readFileSync(path.join(benchmarkSchemaRoot, name), 'utf8').trim(),
  ]),
  // The benchmark product's own scoring rule, which the recipe deliberately
  // does not supply. Without it the leaderboard raises, which is the behaviour
  // the acceptance puts back and asserts at the end of its run.
  '\n-- source: tooling/application-journey-benchmark-domain.sql',
  fs.readFileSync(path.resolve('tooling/application-journey-benchmark-domain.sql'), 'utf8').trim(),
  '',
].join('\n');

fs.writeFileSync(path.join(migrationsRoot, '20260825000000_generated_recipe_security.sql'), migration);
fs.copyFileSync(path.resolve('tooling/supabase-rls-acceptance.sql'), path.join(testsRoot, 'generated_recipes_rls.test.sql'));
fs.copyFileSync(
  path.resolve('tooling/application-journey-benchmark-acceptance.sql'),
  path.join(testsRoot, 'application_journey_benchmark.test.sql'),
);

console.log(
  `Prepared executable Supabase RLS acceptance from ${fragments.length} generated schema fragments`
  + ` plus ${benchmarkFragments.length} from the application-journey benchmark project.`,
);
