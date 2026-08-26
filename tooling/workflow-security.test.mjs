import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function workflowFiles() {
  const root = path.resolve('.github/workflows');
  return fs.readdirSync(root)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => path.join(root, name));
}

function remoteUses(text) {
  return text.split('\n')
    .map((line) => line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1] ?? null)
    .filter(Boolean)
    .filter((value) => !value.startsWith('./') && !value.startsWith('docker://'));
}

function checkoutSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)-\s+uses:\s+actions\/checkout@([0-9a-f]{40})(?:\s+#.*)?$/);
    if (!match) continue;
    const indent = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      const nextItem = line.match(/^(\s*)-\s+/);
      if (nextItem && nextItem[1].length === indent) break;
      body.push(line);
    }
    steps.push(body.join('\n'));
  }
  return steps;
}

test('third-party GitHub Actions are pinned to immutable commit SHAs', () => {
  for (const file of workflowFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const use of remoteUses(text)) {
      const separator = use.lastIndexOf('@');
      assert.notEqual(separator, -1, `${path.relative(process.cwd(), file)} has an action without a ref: ${use}`);
      const ref = use.slice(separator + 1);
      assert.match(ref, /^[0-9a-f]{40}$/, `${path.relative(process.cwd(), file)} must pin ${use.slice(0, separator)} to a 40-character commit SHA, not ${ref}.`);
    }
  }
});

test('checkout never persists the workflow credential into git config', () => {
  let count = 0;
  for (const file of workflowFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    for (const step of checkoutSteps(text)) {
      count += 1;
      assert.match(step, /^\s+with:\s*$[\s\S]*?^\s+persist-credentials:\s+false\s*$/m, `${path.relative(process.cwd(), file)} must set persist-credentials: false on every actions/checkout step.`);
    }
  }
  assert.ok(count > 0, 'Expected at least one pinned actions/checkout step to guard.');
});
