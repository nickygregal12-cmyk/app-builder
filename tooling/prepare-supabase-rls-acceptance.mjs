#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const generatedRoot = path.resolve('.tmp/generated-acceptance-b2b-saas');
const schemaRoot = path.join(generatedRoot, 'supabase', 'schema');
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

const migration = [
  '-- Generated only for executable recipe security acceptance. Do not treat this as a product migration.',
  'create extension if not exists pgtap with schema extensions;',
  ...fragments.flatMap((name) => [
    `\n-- source: ${path.posix.join('supabase/schema', name)}`,
    fs.readFileSync(path.join(schemaRoot, name), 'utf8').trim(),
  ]),
  '',
].join('\n');

fs.writeFileSync(path.join(migrationsRoot, '20260825000000_generated_recipe_security.sql'), migration);
fs.copyFileSync(path.resolve('tooling/supabase-rls-acceptance.sql'), path.join(testsRoot, 'generated_recipes_rls.test.sql'));

console.log(`Prepared executable Supabase RLS acceptance from ${fragments.length} generated schema fragments.`);
