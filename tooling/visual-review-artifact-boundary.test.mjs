import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const WORKFLOW = '.github/workflows/visual-review-evidence.yml';
const ALLOWED_UPLOADS = [
  '.app-builder/visual-review/report.json',
  '.app-builder/visual-review/review-packets.json',
  '.app-builder/visual-review/service/**/captures/*.png',
];

function uploadPaths(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s+path:\s*\|\s*$/.test(line));
  assert.notEqual(start, -1, `${WORKFLOW} must declare a literal upload path block.`);
  const indent = lines[start].match(/^\s*/)[0].length;
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent) break;
    result.push(line.trim());
  }
  return result;
}

test('remote visual review publishes only detached review evidence', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.deepEqual(
    uploadPaths(text),
    ALLOWED_UPLOADS,
    'Do not broaden the visual-review artifact without a deliberate review of the privacy/source boundary. Workspaces, SQLite, raw sources and Factory state are not review evidence.',
  );

  const retention = Number(text.match(/retention-days:\s*(\d+)/)?.[1]);
  assert.ok(Number.isInteger(retention) && retention > 0 && retention <= 7, 'Detached visual review evidence must expire within seven days.');
});

test('superseded visual evidence runs are cancelled but manual runs stay independent', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(text, /group:\s*visual-review-evidence-\$\{\{\s*github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id\s*\}\}/);
  assert.match(text, /cancel-in-progress:\s*true/);
});
