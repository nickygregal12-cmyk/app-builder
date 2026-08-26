import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { analyseModuleGraph } from './lib/module-graph.mjs';

/**
 * The repository's own baseline is one assertion below. The rest are planted fixtures, because a
 * dead-code checker that has only ever been run against a clean tree cannot be told apart from one
 * that returns zero unconditionally — and the three false-positive classes this checker was
 * measured against are each planted here so a future simplification cannot quietly reintroduce
 * them.
 */
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-orphan-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

const BASE = {
  'package.json': JSON.stringify({
    name: 'fixture',
    workspaces: ['packages/*'],
    scripts: { start: 'node tooling/start.mjs' },
  }),
  'tooling/start.mjs': "import { helper } from './lib/helper.mjs';\nhelper();\n",
  'tooling/lib/helper.mjs': "export const helper = () => 'ok';\n",
};

test('the repository itself has no unreachable factory modules', () => {
  const result = analyseModuleGraph({ root: process.cwd() });
  assert.deepEqual(result.orphans, [], `unreachable modules: ${result.orphans.join(', ')}`);
  // A baseline of zero is only meaningful if the walk actually found the repository.
  assert.ok(result.modules.length > 150, `only ${result.modules.length} modules discovered`);
  assert.ok(result.entries.length > 50, `only ${result.entries.length} entry points discovered`);
});

test('a planted orphan is reported', () => {
  const root = fixture({ ...BASE, 'tooling/lib/abandoned.mjs': "export const abandoned = () => 'nobody calls me';\n" });
  const result = analyseModuleGraph({ root });
  assert.deepEqual(result.orphans, ['tooling/lib/abandoned.mjs']);
});

test('an orphan that imports a live module is still an orphan', () => {
  // Reachability is from an entry point, not "is mentioned by something". A dead file importing a
  // live one is the shape a naive reference count gets wrong.
  const root = fixture({ ...BASE, 'tooling/lib/abandoned.mjs': "import { helper } from './helper.mjs';\nexport const abandoned = () => helper();\n" });
  const result = analyseModuleGraph({ root });
  assert.deepEqual(result.orphans, ['tooling/lib/abandoned.mjs']);
  assert.ok(result.reachable.includes('tooling/lib/helper.mjs'));
});

test('a worker named only as a path literal is reachable', () => {
  // The real case: tooling/lib/canary-worker.mjs is spawned as a subprocess and imported by
  // nothing. Deleting it as dead code would break the runtime canary.
  const root = fixture({
    ...BASE,
    'tooling/start.mjs': "import path from 'node:path';\nimport { helper } from './lib/helper.mjs';\nconst WORKER = path.join(process.cwd(), 'tooling/lib/worker.mjs');\nexport { WORKER, helper };\n",
    'tooling/lib/worker.mjs': "export const work = () => 'spawned';\n",
  });
  assert.deepEqual(analyseModuleGraph({ root }).orphans, []);
});

test('a declaration file is not a module and is never reported', () => {
  const root = fixture({ ...BASE, 'packages/thing/types.d.ts': 'export type Thing = { id: string };\n' });
  const result = analyseModuleGraph({ root });
  assert.deepEqual(result.orphans, []);
  assert.ok(!result.modules.includes('packages/thing/types.d.ts'));
});

test("a tool's own configuration is an entry point rather than an orphan", () => {
  const root = fixture({ ...BASE, 'apps/console/vite.config.ts': 'export default { root: true };\n' });
  assert.deepEqual(analyseModuleGraph({ root }).orphans, []);
});

test('an HTML entry reaches the module its script tag names', () => {
  const root = fixture({
    ...BASE,
    'apps/console/index.html': '<script type="module" src="/src/main.tsx"></script>',
    'apps/console/src/main.tsx': "import './app.tsx';\n",
    'apps/console/src/app.tsx': 'export const App = () => null;\n',
  });
  assert.deepEqual(analyseModuleGraph({ root }).orphans, []);
});

test('a workspace export is reachable, including through conditions and wildcards', () => {
  const root = fixture({
    ...BASE,
    'tooling/start.mjs': "import { helper } from './lib/helper.mjs';\nimport { thing } from '@fixture/thing';\nimport { extra } from '@fixture/thing/extra';\nimport { generated } from '@fixture/thing/generated/one.js';\nexport { helper, thing, extra, generated };\n",
    'packages/thing/package.json': JSON.stringify({
      name: '@fixture/thing',
      exports: {
        '.': { types: './types/index.d.ts', default: './src/index.js' },
        './extra': './src/extra.js',
        './generated/*': './generated/*',
      },
    }),
    'packages/thing/src/index.js': "export const thing = 'thing';\n",
    'packages/thing/src/extra.js': "export const extra = 'extra';\n",
    'packages/thing/generated/one.js': "export const generated = 'generated';\n",
  });
  const result = analyseModuleGraph({ root });
  assert.deepEqual(result.orphans, []);
  assert.ok(result.reachable.includes('packages/thing/src/index.js'), 'the conditional default export was not followed');
  assert.ok(result.reachable.includes('packages/thing/src/extra.js'));
});

test('generated-project source is out of scope, and a factory orphan beside it is not', () => {
  // recipes/, templates/ and adapters/ are copied into someone else's repository and are reachable
  // from there. Reporting them would be reporting that the factory does not import the code it
  // ships, which is the whole design.
  const root = fixture({
    ...BASE,
    'recipes/thing/files/src/index.tsx': "import './nothing-here';\nexport const Thing = () => null;\n",
    'templates/shape/files/src/App.tsx': 'export const App = () => null;\n',
    'tooling/lib/abandoned.mjs': 'export const abandoned = 1;\n',
  });
  assert.deepEqual(analyseModuleGraph({ root }).orphans, ['tooling/lib/abandoned.mjs']);
});
