import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { generatedPreviewEnv } from './lib/generated-preview.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function playwrightConfigs() {
  return fs.readdirSync(ROOT).filter((entry) => /^playwright(\..+)?\.config\.ts$/.test(entry));
}

/**
 * The defect this file exists for.
 *
 * `generateProject` writes a template's declared `previewEnv` into every
 * generated repository, and the factory service reads it before supervising a
 * preview. A second harness that starts a generated project and does not read
 * it is not a style problem: `astro dev` backgrounds itself where it detects an
 * agentic environment, so the harness sees its own dev server exit immediately
 * and an orphan daemon keeps the port. Hosted CI is not one of those
 * environments, which is exactly why a green CI run is not evidence here.
 */
test('every harness that starts a generated project reads that project\'s declared preview environment', () => {
  const configs = playwrightConfigs();
  assert.ok(configs.length >= 2, 'expected the root Playwright configs to be discoverable by name');

  const starting = configs.filter((config) => /webServer\s*:/.test(read(config)) && /--prefix/.test(read(config)));
  assert.ok(starting.length >= 2, 'expected at least the accessibility and real-business harnesses to start a generated project');

  for (const config of starting) {
    const source = read(config);
    assert.match(
      source,
      /env:\s*generatedPreviewEnv\(/,
      `${config} starts a generated project but does not pass its declared preview environment. Use generatedPreviewEnv() from tooling/lib/generated-preview.mjs.`,
    );
    assert.match(
      source,
      /from '\.\/tooling\/lib\/generated-preview\.mjs'/,
      `${config} must read the preview contract through the one helper rather than re-deriving it.`,
    );
  }
});

test('the preview contract is read from the generated repository, and a repository without one still starts', () => {
  const withDeclaration = path.join(ROOT, '.tmp/generated-preview-contract-fixture');
  fs.rmSync(withDeclaration, { recursive: true, force: true });
  fs.mkdirSync(path.join(withDeclaration, '.app-builder'), { recursive: true });
  fs.writeFileSync(
    path.join(withDeclaration, '.app-builder/project.json'),
    JSON.stringify({ schemaVersion: 1, preview: { env: { ASTRO_DEV_BACKGROUND: '0', IGNORED: 3 } } }),
  );

  assert.deepEqual(generatedPreviewEnv(withDeclaration), { ASTRO_DEV_BACKGROUND: '0' }, 'a non-string value is not an environment variable and is dropped rather than stringified');
  assert.deepEqual(generatedPreviewEnv(path.join(ROOT, '.tmp/no-such-generated-project')), {}, 'a repository cloned without factory state still starts');

  fs.writeFileSync(path.join(withDeclaration, '.app-builder/project.json'), '{ not json');
  assert.deepEqual(generatedPreviewEnv(withDeclaration), {}, 'an unreadable record is not a reason to refuse to start a dev server');

  fs.rmSync(withDeclaration, { recursive: true, force: true });
});

test('a template whose dev server would daemonise declares what stops it, and generation carries the declaration', () => {
  const templates = fs
    .readdirSync(path.join(ROOT, 'templates'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'templates', entry.name, 'template.json')))
    .map((entry) => JSON.parse(read(path.join('templates', entry.name, 'template.json'))));

  assert.ok(templates.length >= 2, 'the renderer contract needs more than one template to be a contract');

  const declaring = templates.filter((template) => template.previewEnv && Object.keys(template.previewEnv).length);
  assert.ok(
    declaring.length >= 1,
    'the static/content template daemonises its dev server and must declare what stops it, or the preview contract has no supplier',
  );
  for (const template of declaring) {
    for (const [key, value] of Object.entries(template.previewEnv)) {
      assert.equal(typeof value, 'string', `${template.id} declares previewEnv.${key} as something other than a string`);
    }
  }
});
